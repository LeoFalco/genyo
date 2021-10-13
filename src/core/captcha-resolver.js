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
  console.log(response)
  return String(response.request)
}

function extractCapchaResponse (response) {
  return String(response.request)
}

class ServiceError extends Error {
  constructor (response) {
    const message = String(response.data.request || 'Unknown error')
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

  async startCapchaResolution ({ pageurl, googleKey }) {
    return fetch('http://2captcha.com/in.php', {
      method: 'POST',
      body: new URLSearchParams({
        key: this.apiKey,
        method: 'userrecaptcha',
        googlekey: googleKey,
        pageurl,
        json: 1
      })
    }).then(response => response.json())
      .then(extractRequestId)
  }

  async verifyCapchaResponse ({ requestId }) {
    return fetch('http://2captcha.com/res.php', {
      method: 'POST',
      body: new URLSearchParams({
        key: this.apiKey,
        id: requestId,
        action: 'get',
        json: 1,
        header_acao: 1
      })
    }).then(response => response.json())
  }

  async resolveCapcha ({ pageurl, googleKey }) {
    const requestId = await this.startCapchaResolution({ pageurl, googleKey })

    console.log('requestId', requestId)

    let attempts = 0
    do {
      console.log('waiting for 15s to check for capcha resolution')
      await delay(ms('15s'))

      console.log('attempts', attempts)

      const response = await this.verifyCapchaResponse({ requestId })
      console.log('response', response)

      if (isResolved(response)) {
        return extractCapchaResponse(response)
      }

      if (isError(response)) {
        throw new ServiceError(response)
      }

      attempts++
    } while (attempts < MAX_ATTEMPTS)

    throw new MaxAttemptsError()
  }
}

module.exports = {
  CaptchaResolver
}
