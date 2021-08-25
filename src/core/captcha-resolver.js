'use strict'

const { default: axios } = require('axios')
const ms = require('ms')
const { delay } = require('./delay')

const MAX_ATTEMPTS = 20

function isError (response) {
  return String(response.data.request).startsWith('ERROR')
}

function isResolved (response) {
  return String(response.data.status) === '1'
}

function extractRequestId (response) {
  return String(response.data.request)
}

function extractCapchaResponse (response) {
  return String(response.data.request)
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
    this.client = axios.default.create({
      baseURL: baseURL
    })
  }

  async startCapchaResolution ({ pageurl, googleKey }) {
    return this.client.request({
      method: 'POST',
      url: 'in.php',
      params: {
        key: this.apiKey,
        googlekey: googleKey,
        pageurl: pageurl,
        method: 'userrecaptcha',
        json: 1
      }
    })
  }

  async verifyCapchaResponse ({ requestId }) {
    return this.client.request({
      method: 'POST',
      url: 'res.php',
      params: {
        key: this.apiKey,
        id: requestId,
        action: 'get',
        json: 1,
        header_acao: 1
      }
    })
  }

  async resolveCapcha ({ pageurl, googleKey }) {
    const requestId = await this.startCapchaResolution({ pageurl, googleKey })
      .then(extractRequestId)
    console.log('requestId', requestId)

    let attempts = 0
    while (attempts < MAX_ATTEMPTS) {
      await delay(ms('15s'))

      console.log('attempts', attempts)

      const response = await this.verifyCapchaResponse({ requestId })
      console.log('response', response.data)

      if (isError(response)) {
        throw new ServiceError(response)
      }

      if (isResolved(response)) {
        return extractCapchaResponse(response)
      }

      attempts++
    }

    throw new MaxAttemptsError()
  }
}

module.exports = {
  CaptchaResolver
}
