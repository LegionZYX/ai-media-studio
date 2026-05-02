import express from 'express'
import cors from 'cors'
import { z } from 'zod'
import { contentSchema, seedanceAssetCreateSchema, seedanceAssetGroupSchema, seedanceJobSchema } from './schema.js'
import { readContent as defaultReadContent, writeContent as defaultWriteContent } from './content-store.js'

const headersSchema = z.object({
  'x-api-key': z.string().min(1, 'missing api key'),
  'x-base-url': z.string().url('invalid base url'),
})

function jsonResponse(res, status, body) {
  res.status(status).json(body)
}

function normalizeBaseUrl(baseUrl) {
  return baseUrl.replace(/\/+$/, '')
}

async function parseUpstreamResponse(response) {
  const contentType = response.headers.get('content-type') ?? ''

  if (contentType.includes('application/json')) {
    return response.json()
  }

  return { raw: await response.text() }
}

function buildVideoResultUrl(baseUrl, taskId, resultPath) {
  const normalizedBase = normalizeBaseUrl(baseUrl)
  const normalizedTaskId = encodeURIComponent(taskId)

  if (resultPath) {
    if (resultPath.includes(':taskId')) {
      return `${normalizedBase}${resultPath.replace(':taskId', normalizedTaskId)}`
    }

    return `${normalizedBase}${resultPath.replace(/\/+$/, '')}/${normalizedTaskId}`
  }

  return `${normalizedBase}/api/v1/videos/result/${normalizedTaskId}`
}

function extractHeaders(req) {
  const parsed = headersSchema.safeParse({
    'x-api-key': req.get('x-api-key'),
    'x-base-url': req.get('x-base-url'),
  })

  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.flatten(),
    }
  }

  return {
    ok: true,
    value: parsed.data,
  }
}

function createToolResult(response, data) {
  const taskId = data?.id ?? data?.task_id ?? data?.taskId ?? null
  const state = data?.status ?? data?.state ?? null
  const outputUrl =
    data?.video?.url ??
    data?.video_url ??
    data?.url ??
    data?.output?.[0]?.url ??
    data?.data?.[0]?.url ??
    null

  return {
    ok: response.ok,
    status: response.status,
    taskId,
    state,
    outputUrl,
    data,
  }
}

export function createApp(deps = {}) {
  const readContent = deps.readContent ?? defaultReadContent
  const writeContent = deps.writeContent ?? defaultWriteContent
  const upstreamFetch = deps.fetchImpl ?? fetch
  const app = express()

  app.use(cors())
  app.use(express.json({ limit: '15mb' }))

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true })
  })

  app.get('/api/content', (_req, res) => {
    const payload = readContent()
    res.json(payload)
  })

  app.put('/api/content', (req, res) => {
    const parsed = contentSchema.safeParse(req.body)

    if (!parsed.success) {
      jsonResponse(res, 400, {
        saved: false,
        error: 'invalid_payload',
        details: parsed.error.flatten(),
      })
      return
    }

    writeContent(parsed.data)
    res.json({ saved: true, content: parsed.data })
  })

  app.post('/api/tools/seedance/jobs', async (req, res) => {
    const parsed = seedanceJobSchema.safeParse(req.body)

    if (!parsed.success) {
      jsonResponse(res, 400, {
        ok: false,
        error: 'invalid_payload',
        details: parsed.error.flatten(),
      })
      return
    }

    const { baseUrl, apiKey, payload } = parsed.data

    try {
      const response = await upstreamFetch(`${normalizeBaseUrl(baseUrl)}/api/v1/videos/generations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          ...payload,
          async: payload.async ?? true,
        }),
      })

      const data = await parseUpstreamResponse(response)
      jsonResponse(res, response.ok ? 200 : response.status, createToolResult(response, data))
    } catch (error) {
      jsonResponse(res, 502, {
        ok: false,
        error: 'upstream_request_failed',
        message: error instanceof Error ? error.message : 'Unknown upstream error',
      })
    }
  })

  app.get('/api/tools/seedance/jobs/:taskId', async (req, res) => {
    const headerResult = extractHeaders(req)

    if (!headerResult.ok) {
      jsonResponse(res, 400, {
        ok: false,
        error: 'invalid_headers',
        details: headerResult.error,
      })
      return
    }

    const resultPath =
      typeof req.query.resultPath === 'string' && req.query.resultPath.length > 0
        ? req.query.resultPath
        : null

    try {
      const response = await upstreamFetch(
        buildVideoResultUrl(headerResult.value['x-base-url'], req.params.taskId, resultPath),
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${headerResult.value['x-api-key']}`,
          },
        },
      )

      const data = await parseUpstreamResponse(response)
      jsonResponse(res, response.ok ? 200 : response.status, createToolResult(response, data))
    } catch (error) {
      jsonResponse(res, 502, {
        ok: false,
        error: 'upstream_request_failed',
        message: error instanceof Error ? error.message : 'Unknown upstream error',
      })
    }
  })

  app.post('/api/tools/seedance/assets/groups', async (req, res) => {
    const parsed = seedanceAssetGroupSchema.safeParse(req.body)

    if (!parsed.success) {
      jsonResponse(res, 400, {
        ok: false,
        error: 'invalid_payload',
        details: parsed.error.flatten(),
      })
      return
    }

    const { baseUrl, apiKey, name, platform } = parsed.data

    try {
      const response = await upstreamFetch(`${normalizeBaseUrl(baseUrl)}/api/v1/assets/group`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ name, platform }),
      })

      const data = await parseUpstreamResponse(response)
      jsonResponse(res, response.ok ? 200 : response.status, {
        ok: response.ok,
        status: response.status,
        groupId: data?.id ?? null,
        data,
      })
    } catch (error) {
      jsonResponse(res, 502, {
        ok: false,
        error: 'upstream_request_failed',
        message: error instanceof Error ? error.message : 'Unknown upstream error',
      })
    }
  })

  app.post('/api/tools/seedance/assets', async (req, res) => {
    const parsed = seedanceAssetCreateSchema.safeParse(req.body)

    if (!parsed.success) {
      jsonResponse(res, 400, {
        ok: false,
        error: 'invalid_payload',
        details: parsed.error.flatten(),
      })
      return
    }

    const { baseUrl, apiKey, ...payload } = parsed.data

    try {
      const response = await upstreamFetch(`${normalizeBaseUrl(baseUrl)}/api/v1/assets/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
      })

      const data = await parseUpstreamResponse(response)
      jsonResponse(res, response.ok ? 200 : response.status, {
        ok: response.ok,
        status: response.status,
        taskId: data?.id ?? null,
        data,
      })
    } catch (error) {
      jsonResponse(res, 502, {
        ok: false,
        error: 'upstream_request_failed',
        message: error instanceof Error ? error.message : 'Unknown upstream error',
      })
    }
  })

  app.get('/api/tools/seedance/assets/:taskId', async (req, res) => {
    const headerResult = extractHeaders(req)

    if (!headerResult.ok) {
      jsonResponse(res, 400, {
        ok: false,
        error: 'invalid_headers',
        details: headerResult.error,
      })
      return
    }

    try {
      const response = await upstreamFetch(
        `${normalizeBaseUrl(headerResult.value['x-base-url'])}/api/v1/assets/${encodeURIComponent(req.params.taskId)}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${headerResult.value['x-api-key']}`,
          },
        },
      )

      const data = await parseUpstreamResponse(response)
      jsonResponse(res, response.ok ? 200 : response.status, {
        ok: response.ok,
        status: response.status,
        assetId: data?.id ?? null,
        state: data?.status ?? data?.state ?? null,
        assetUrl: data?.url ?? null,
        data,
      })
    } catch (error) {
      jsonResponse(res, 502, {
        ok: false,
        error: 'upstream_request_failed',
        message: error instanceof Error ? error.message : 'Unknown upstream error',
      })
    }
  })

  return app
}
