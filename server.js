const http = require('node:http')
const { load, save } = require('./server/db/secureStore')

const PORT = process.env.PORT || 8787
const CAMPAIGN_DAYS = 60

function nowISO(){ return new Date().toISOString() }
function campaignEnd(){
  const d = new Date()
  d.setDate(d.getDate() + CAMPAIGN_DAYS)
  return d.toISOString().split('T')[0]
}

function send(res, status, payload){
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
  res.end(JSON.stringify(payload))
}

function parseBody(req){
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', (chunk) => { raw += chunk })
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}) } catch { resolve({}) }
    })
  })
}

function getPlayer(state, wallet){
  if(!state.players[wallet]){
    state.players[wallet] = {
      wallet,
      createdAt: nowISO(),
      totalWins: 0,
      bestTimeSeconds: null,
      networkStats: { devnet: { wins: 0 }, 'mainnet-beta': { wins: 0 } },
      questProgress: { daily_win: 0, weekly_wins: 0, monthly_wins: 0 },
      customizations: [],
      campaignEndsAt: campaignEnd()
    }
  }
  return state.players[wallet]
}

function leaderboard(state){
  return Object.values(state.players)
    .filter((p) => p.bestTimeSeconds !== null)
    .sort((a,b) => a.bestTimeSeconds - b.bestTimeSeconds)
    .slice(0, 100)
    .map((p) => ({ wallet: p.wallet, bestTimeSeconds: p.bestTimeSeconds, totalWins: p.totalWins }))
}

const server = http.createServer(async (req, res) => {
  if(req.method === 'OPTIONS'){
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    })
    return res.end()
  }

  const state = load()
  const url = new URL(req.url, `http://${req.headers.host}`)

  if(req.method === 'GET' && url.pathname.startsWith('/api/profile/')){
    const wallet = url.pathname.split('/').pop()
    const player = getPlayer(state, wallet)
    save(state)
    return send(res, 200, { ...player, leaderboard: leaderboard(state) })
  }

  if(req.method === 'POST' && url.pathname === '/api/game-result'){
    const body = await parseBody(req)
    const player = getPlayer(state, body.wallet)
    if(body.won){
      player.totalWins += 1
      player.networkStats[body.network] = player.networkStats[body.network] || { wins: 0 }
      player.networkStats[body.network].wins += 1
      if(player.bestTimeSeconds === null || body.durationSeconds < player.bestTimeSeconds){
        player.bestTimeSeconds = body.durationSeconds
      }
      player.questProgress.daily_win = Math.min(1, player.questProgress.daily_win + 1)
      player.questProgress.weekly_wins = Math.min(3, player.questProgress.weekly_wins + 1)
      player.questProgress.monthly_wins = Math.min(10, player.questProgress.monthly_wins + 1)
    }
    save(state)
    return send(res, 200, { ok: true })
  }

  if(req.method === 'POST' && url.pathname === '/api/customization/purchase'){
    const body = await parseBody(req)
    const player = getPlayer(state, body.wallet)
    player.customizations.push({
      type: body.type,
      value: body.value,
      network: body.network,
      priceSol: body.priceSol,
      transactionReference: body.transactionReference,
      createdAt: nowISO()
    })
    save(state)
    return send(res, 200, { ok: true })
  }

  if(req.method === 'POST' && url.pathname === '/api/reward'){
    const body = await parseBody(req)
    const player = getPlayer(state, body.wallet)
    const isEligible = player.questProgress.daily_win >= 1
    if(isEligible){
      state.rewards.push({ wallet: body.wallet, network: body.network, at: nowISO(), source: 'secure-reward-wallet' })
      save(state)
      return send(res, 200, { ok: true, rewarded: true })
    }
    return send(res, 200, { ok: true, rewarded: false })
  }

  return send(res, 404, { error: 'Not found' })
})

server.listen(PORT, () => {
  console.log(`Secure game API listening on :${PORT}`)
})
