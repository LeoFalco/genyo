'use strict'

const fetch = require('node-fetch')
const ms = require('ms')
const { delay } = require('./delay')

const MAX_ATTEMPTS = 20

function isError (response) {
  return String(response.request).startsWith('ERROR')
}

function isResolved (response) {
  return String(response.status) === '1'
}

function extractRequestId (response) {
  return String(response.request)
}

function extractCapchaResponse (response) {
  return String(response.request)
}

class ServiceError extends Error {
  constructor (response) {
    const message = String(response.request || 'Unknown error')
    super(`Capcha resolver service error: ${message}`)
  }
}

class MaxAttemptsError extends Error {
  constructor () {
    super('Capcha resolver service max attempts err')
  }
}

class CaptchaResolver {
  constructor ({ apiKey, baseURL }) {
    this.apiKey = apiKey
  }

  async startCapchaResolution ({ pageUrl, googleKey }) {
    return fetch('http://2captcha.com/in.php', {
      method: 'POST',
      body: new URLSearchParams({
        key: this.apiKey,
        method: 'userrecaptcha',
        googlekey: googleKey,
        pageurl: pageUrl,
        json: 1
      })
    }).then(response => response.json())
  }

  async getBalance () {
    return fetch('http://2captcha.com/res.php', {
      method: 'POST',
      body: new URLSearchParams({
        action: 'getbalance',
        key: this.apiKey,
        json: 1,
        header_acao: 1
      })
    }).then(response => response.json())
  }

  async verifyCapchaResponse ({ requestId }) {
    return fetch('http://2captcha.com/res.php', {
      method: 'POST',
      body: new URLSearchParams({
        key: this.apiKey,
        id: requestId,
        action: 'get2',
        json: 1,
        header_acao: 1
      })
    }).then(response => response.json())
  }

  async resolveCapcha ({ pageUrl, googleKey }) {
    const balanceResponse = await this.getBalance()
    console.log('balanceResponse', balanceResponse)

    const startCapchaResolutionResponse = await this.startCapchaResolution({ pageUrl, googleKey })
    console.log('startCapchaResolutionResponse', startCapchaResolutionResponse)
    const requestId = extractRequestId(startCapchaResolutionResponse)

    let attempts = 0
    do {
      console.log('attempts', attempts)
      console.log('waiting for 15s to check for capcha resolution')
      await delay(ms('15s'))

      const verifyCapchaResponse = await this.verifyCapchaResponse({ requestId })

      console.log('verifyCapchaResponse', verifyCapchaResponse)

      if (isResolved(verifyCapchaResponse)) {
        return extractCapchaResponse(verifyCapchaResponse)
      }

      if (isError(verifyCapchaResponse)) {
        throw new ServiceError(verifyCapchaResponse)
      }

      attempts++
    } while (attempts < MAX_ATTEMPTS)

    throw new MaxAttemptsError()
  }
}

module.exports = {
  CaptchaResolver
}
