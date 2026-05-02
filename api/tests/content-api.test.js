import test from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { createApp } from '../src/app.js'

test('GET /api/content returns structured homepage content', async () => {
  const app = createApp({
    readContent() {
      return {
        site: {
          title: 'AI 工具内部培训与合规支持中心',
        },
        services: [{ id: 'training', title: '团队培训方案' }],
      }
    },
    writeContent() {
      throw new Error('should not write')
    },
  })

  const response = await request(app).get('/api/content')

  assert.equal(response.status, 200)
  assert.equal(response.body.site.title, 'AI 工具内部培训与合规支持中心')
  assert.equal(response.body.services[0].id, 'training')
})

test('PUT /api/content validates and saves content payload', async () => {
  let savedPayload = null

  const app = createApp({
    readContent() {
      return {
        site: { title: 'old' },
        services: [],
      }
    },
    writeContent(payload) {
      savedPayload = payload
      return payload
    },
  })

  const nextPayload = {
    site: {
      title: 'AI 工具内部培训与合规支持中心',
      subtitle: '面向团队培训、账号安全自检与 API 接入支持',
      primaryAction: '进入知识库',
      secondaryAction: '查看服务',
    },
    metrics: [
      { label: '培训模块', value: '12+', note: '覆盖环境自检、接入与运维流程' },
    ],
    services: [
      {
        id: 'audit',
        title: '账号环境自检',
        summary: '帮助团队建立稳定的使用环境和检查流程',
        price: '按需报价',
      },
    ],
    sections: [
      {
        id: 'hero',
        title: '让团队更稳定地使用 AI 工具',
        body: '把账号安全、环境一致性和 API 使用规范整理成一套内部体系。',
      },
    ],
    faq: [
      {
        question: '为什么需要环境一致性？',
        answer: '因为团队成员的设备、时区、浏览器和网络设置需要统一规范。',
      },
    ],
  }

  const response = await request(app).put('/api/content').send(nextPayload)

  assert.equal(response.status, 200)
  assert.equal(savedPayload.site.title, nextPayload.site.title)
  assert.equal(response.body.saved, true)
})

test('PUT /api/content rejects invalid payloads', async () => {
  const app = createApp({
    readContent() {
      return { site: { title: 'old' }, services: [] }
    },
    writeContent() {
      throw new Error('should not write')
    },
  })

  const response = await request(app).put('/api/content').send({
    site: {
      title: '',
    },
  })

  assert.equal(response.status, 400)
  assert.equal(response.body.saved, false)
})

test('POST /api/tools/seedance/jobs proxies generation requests', async () => {
  let capturedRequest = null

  const app = createApp({
    fetchImpl: async (url, init) => {
      capturedRequest = { url, init }

      return new Response(
        JSON.stringify({
          id: 'task-123',
          status: 'queued',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      )
    },
  })

  const response = await request(app).post('/api/tools/seedance/jobs').send({
    baseUrl: 'https://aiai.ac',
    apiKey: 'test-key',
    payload: {
      model: 'doubao-seedance-2.0',
      prompt: 'test prompt',
      image: 'https://example.com/frame.png',
      duration: 5,
      aspect_ratio: '16:9',
      extra_body: {
        real_person_mode: true,
      },
    },
  })

  assert.equal(response.status, 200)
  assert.equal(response.body.taskId, 'task-123')
  assert.equal(response.body.state, 'queued')
  assert.equal(capturedRequest.url, 'https://aiai.ac/api/v1/videos/generations')
  assert.equal(capturedRequest.init.headers.Authorization, 'Bearer test-key')

  const parsedBody = JSON.parse(capturedRequest.init.body)
  assert.equal(parsedBody.async, true)
  assert.equal(parsedBody.extra_body.real_person_mode, true)
})

test('GET /api/tools/seedance/jobs/:taskId proxies result polling', async () => {
  let capturedUrl = null

  const app = createApp({
    fetchImpl: async (url) => {
      capturedUrl = url

      return new Response(
        JSON.stringify({
          id: 'task-123',
          status: 'succeed',
          video: { url: 'https://cdn.example.com/out.mp4' },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      )
    },
  })

  const response = await request(app)
    .get('/api/tools/seedance/jobs/task-123')
    .set('x-api-key', 'test-key')
    .set('x-base-url', 'https://aiai.ac')

  assert.equal(response.status, 200)
  assert.equal(response.body.outputUrl, 'https://cdn.example.com/out.mp4')
  assert.equal(capturedUrl, 'https://aiai.ac/api/v1/videos/result/task-123')
})

test('POST /api/tools/seedance/assets/groups proxies asset group creation', async () => {
  const app = createApp({
    fetchImpl: async () =>
      new Response(JSON.stringify({ id: 'group-1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
  })

  const response = await request(app).post('/api/tools/seedance/assets/groups').send({
    baseUrl: 'https://aiai.ac',
    apiKey: 'test-key',
    name: '测试素材组',
    platform: 'bytedance',
  })

  assert.equal(response.status, 200)
  assert.equal(response.body.groupId, 'group-1')
})

test('POST /api/tools/seedance/assets proxies asset creation', async () => {
  let capturedBody = null

  const app = createApp({
    fetchImpl: async (_url, init) => {
      capturedBody = JSON.parse(init.body)

      return new Response(JSON.stringify({ id: 'asset-task-1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    },
  })

  const response = await request(app).post('/api/tools/seedance/assets').send({
    baseUrl: 'https://aiai.ac',
    apiKey: 'test-key',
    group_id: 'group-1',
    name: '参考图1',
    url: 'data:image/png;base64,abc',
    asset_type: 'Image',
    platform: 'bytedance',
  })

  assert.equal(response.status, 200)
  assert.equal(response.body.taskId, 'asset-task-1')
  assert.equal(capturedBody.url, 'data:image/png;base64,abc')
})

test('GET /api/tools/seedance/assets/:taskId proxies asset status', async () => {
  const app = createApp({
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          id: 'asset-1',
          status: 'succeed',
          url: 'https://cdn.example.com/asset.png',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
  })

  const response = await request(app)
    .get('/api/tools/seedance/assets/task-1')
    .set('x-api-key', 'test-key')
    .set('x-base-url', 'https://aiai.ac')

  assert.equal(response.status, 200)
  assert.equal(response.body.assetId, 'asset-1')
  assert.equal(response.body.state, 'succeed')
  assert.equal(response.body.assetUrl, 'https://cdn.example.com/asset.png')
})

test('POST /api/tools/seedance/assets/upload uploads a local file and returns asset ref', async () => {
  const calls = []

  const app = createApp({
    sleepImpl: async () => {},
    fetchImpl: async (url, init) => {
      calls.push({ url, init })

      if (url.endsWith('/api/v1/assets/group')) {
        return new Response(JSON.stringify({ id: 'group-2' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      if (url.endsWith('/api/v1/assets/create')) {
        return new Response(JSON.stringify({ id: 'asset-task-2' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      if (url.endsWith('/api/v1/assets/asset-task-2')) {
        return new Response(
          JSON.stringify({
            id: 'asset-2',
            status: 'succeed',
            url: 'https://cdn.example.com/uploaded.png',
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        )
      }

      throw new Error(`unexpected url: ${url}`)
    },
  })

  const response = await request(app)
    .post('/api/tools/seedance/assets/upload')
    .field('baseUrl', 'https://aiai.ac')
    .field('apiKey', 'test-key')
    .field('group_name', '自动素材组')
    .field('name', '首帧上传')
    .field('asset_type', 'Image')
    .field('platform', 'bytedance')
    .attach('file', Buffer.from('fake-image'), 'frame.png')

  assert.equal(response.status, 200)
  assert.equal(response.body.groupId, 'group-2')
  assert.equal(response.body.taskId, 'asset-task-2')
  assert.equal(response.body.assetId, 'asset-2')
  assert.equal(response.body.assetRef, 'asset://asset-2')
  assert.equal(calls[0].url, 'https://aiai.ac/api/v1/assets/group')
  assert.equal(calls[1].url, 'https://aiai.ac/api/v1/assets/create')

  const createBody = JSON.parse(calls[1].init.body)
  assert.equal(createBody.group_id, 'group-2')
  assert.match(createBody.url, /^data:image\/png;base64,/)
})
