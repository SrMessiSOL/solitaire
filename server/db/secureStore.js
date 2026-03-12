const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const DB_PATH = path.join(__dirname, '..', 'data', 'secure-db.enc')
const IV_LENGTH = 12

function getKey(){
  const secret = process.env.SECURE_DB_KEY || 'dev-only-change-this-key-in-production'
  return crypto.createHash('sha256').update(secret).digest()
}

function encrypt(payload){
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv)
  const body = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, body]).toString('base64')
}

function decrypt(raw){
  const data = Buffer.from(raw, 'base64')
  const iv = data.subarray(0, IV_LENGTH)
  const tag = data.subarray(IV_LENGTH, IV_LENGTH + 16)
  const body = data.subarray(IV_LENGTH + 16)
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv)
  decipher.setAuthTag(tag)
  const json = Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8')
  return JSON.parse(json)
}

function load(){
  try {
    if(!fs.existsSync(DB_PATH)) return { players: {}, rewards: [] }
    return decrypt(fs.readFileSync(DB_PATH, 'utf8'))
  } catch {
    return { players: {}, rewards: [] }
  }
}

function save(state){
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })
  fs.writeFileSync(DB_PATH, encrypt(state), { mode: 0o600 })
}

module.exports = { load, save }
