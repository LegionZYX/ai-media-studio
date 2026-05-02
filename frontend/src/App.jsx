import { useEffect, useMemo, useState } from 'react'
import './App.css'

const RUNTIME_IS_LOCAL =
  typeof window !== 'undefined' &&
  ['127.0.0.1', 'localhost'].includes(window.location.hostname)

const API_BASE = (
  import.meta.env.VITE_TOOL_API_BASE || (RUNTIME_IS_LOCAL ? 'http://127.0.0.1:8787' : '')
).replace(/\/+$/, '')

const IMAGE_MODEL = {
  id: 'gpt-image-2',
  label: 'GPT Image 2',
}

const imageModes = [
  { id: 'text', label: '文生图' },
  { id: 'edit', label: '图生图' },
]

const videoModes = [
  { id: 'text', label: '文生视频' },
  { id: 'image', label: '首帧 / 首尾帧生视频' },
  { id: 'multi', label: '多参考生视频' },
]

const videoModels = [
  { id: 'doubao-seedance-2.0', label: 'Seedance 2.0', resolutions: ['480p', '720p', '1080p'] },
  { id: 'doubao-seedance-2.0-fast', label: 'Seedance 2.0 Fast', resolutions: ['480p', '720p'] },
]

const imageSizeOptions = ['1024x1024', '1024x1536', '1536x1024']
const imageQualityOptions = ['auto', 'low', 'medium', 'high']
const imageFormatOptions = ['png', 'jpeg', 'webp']
const aspectRatioOptions = ['16:9', '9:16', '3:4', '4:3', '1:1', '21:9', 'adaptive']

function normalizeBaseUrl(baseUrl) {
  return baseUrl.trim().replace(/\/+$/, '')
}

function createDataUrlFromBase64(base64Value, format) {
  const mimeType = format === 'jpeg' ? 'image/jpeg' : `image/${format || 'png'}`
  return `data:${mimeType};base64,${base64Value}`
}

function buildCurl({ url, apiKey, payload }) {
  return `curl -X POST "${url}" -H "Authorization: Bearer ${apiKey || 'YOUR_API_KEY'}" -H "Content-Type: application/json" -d '${JSON.stringify(payload, null, 2)}'`
}

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('file_read_failed'))
    reader.readAsDataURL(file)
  })
}

async function remoteUrlToFile(url) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error('无法读取远程参考图')
  }

  const blob = await response.blob()
  const name = url.split('/').pop() || 'reference-image.png'
  return new File([blob], name, { type: blob.type || 'image/png' })
}

function ResultShell({ title, children }) {
  return (
    <section className="result-shell">
      <h4>{title}</h4>
      {children}
    </section>
  )
}

function App() {
  const [content, setContent] = useState(null)
  const [surface, setSurface] = useState('image')

  const [imageState, setImageState] = useState({
    baseUrl: 'https://api.openai.com',
    apiKey: '',
    mode: imageModes[0].id,
    prompt: '',
    size: imageSizeOptions[0],
    quality: imageQualityOptions[0],
    format: imageFormatOptions[0],
    imageFile: null,
    imageUrl: '',
    previewUrl: '',
    submitting: false,
    error: '',
    result: null,
    resultImageUrl: '',
    requestPreview: null,
    curlCommand: '',
  })

  const [videoState, setVideoState] = useState({
    baseUrl: 'https://aiai.ac',
    apiKey: '',
    model: videoModels[0].id,
    mode: videoModes[0].id,
    prompt: '',
    duration: 5,
    resolution: '720p',
    aspectRatio: '16:9',
    realPersonMode: false,
    frameFile: null,
    frameUrl: '',
    tailFile: null,
    tailUrl: '',
    multiText: '',
    multiFiles: [],
    multiPreviewUrls: [],
    referenceVideoUrl: '',
    referenceAudioUrl: '',
    framePreviewUrl: '',
    tailPreviewUrl: '',
    submitting: false,
    polling: false,
    pollCount: 0,
    taskId: '',
    error: '',
    result: null,
    requestPreview: null,
    curlCommand: '',
    assetGroupName: '测试素材组',
    assetName: '参考素材',
    assetGroupId: '',
    assetTarget: 'image',
    assetUrl: '',
    assetFile: null,
    assetPreviewUrl: '',
    assetTaskId: '',
    assetStatus: null,
    assetSubmitting: false,
  })

  const activeVideoModel = useMemo(
    () => videoModels.find((item) => item.id === videoState.model) ?? videoModels[0],
    [videoState.model],
  )

  useEffect(() => {
    if (!API_BASE) {
      return
    }

    let active = true

    async function loadContent() {
      try {
        const response = await fetch(`${API_BASE}/api/content`)
        const data = await response.json()
        if (active) {
          setContent(data)
        }
      } catch {
        if (active) {
          setContent(null)
        }
      }
    }

    loadContent()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!videoState.polling || !videoState.taskId || !API_BASE) {
      return undefined
    }

    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`${API_BASE}/api/tools/seedance/jobs/${encodeURIComponent(videoState.taskId)}`, {
          headers: {
            'x-api-key': videoState.apiKey,
            'x-base-url': normalizeBaseUrl(videoState.baseUrl),
          },
        })
        const data = await response.json()
        const state = data.state ?? data.data?.status ?? ''
        const stop = ['succeed', 'completed', 'failed', 'error', 'cancelled', 'canceled'].includes(state)

        setVideoState((current) => ({
          ...current,
          result: data,
          pollCount: current.pollCount + 1,
          polling: !stop && current.pollCount + 1 < 30,
          error: response.ok ? current.error : data.message || '轮询失败',
        }))
      } catch {
        setVideoState((current) => ({
          ...current,
          polling: false,
          error: '轮询任务结果失败，请稍后重试。',
        }))
      }
    }, 2500)

    return () => window.clearTimeout(timer)
  }, [videoState.polling, videoState.taskId, videoState.apiKey, videoState.baseUrl])

  const setImagePatch = (patch) => setImageState((current) => ({ ...current, ...patch }))
  const setVideoPatch = (patch) => setVideoState((current) => ({ ...current, ...patch }))

  async function submitImage(event) {
    event.preventDefault()
    setImagePatch({ submitting: true, error: '', result: null, resultImageUrl: '' })

    try {
      const baseUrl = normalizeBaseUrl(imageState.baseUrl)
      const endpoint = imageState.mode === 'edit' ? '/v1/images/edits' : '/v1/images/generations'
      const targetUrl = `${baseUrl}${endpoint}`
      let response
      let requestPreview

      if (imageState.mode === 'edit') {
        const formData = new FormData()
        const sourceFile =
          imageState.imageFile || (imageState.imageUrl ? await remoteUrlToFile(imageState.imageUrl) : null)

        if (!sourceFile) {
          throw new Error('请先上传参考图或填写图片 URL')
        }

        formData.append('model', IMAGE_MODEL.id)
        formData.append('prompt', imageState.prompt)
        formData.append('size', imageState.size)
        formData.append('quality', imageState.quality)
        formData.append('output_format', imageState.format)
        formData.append('image[]', sourceFile)

        requestPreview = {
          model: IMAGE_MODEL.id,
          prompt: imageState.prompt,
          size: imageState.size,
          quality: imageState.quality,
          output_format: imageState.format,
          image: imageState.imageFile?.name || imageState.imageUrl,
        }

        response = await fetch(targetUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${imageState.apiKey}`,
          },
          body: formData,
        })
      } else {
        requestPreview = {
          model: IMAGE_MODEL.id,
          prompt: imageState.prompt,
          size: imageState.size,
          quality: imageState.quality,
          output_format: imageState.format,
        }

        response = await fetch(targetUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${imageState.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestPreview),
        })
      }

      const data = await response.json()
      const first = data?.data?.[0] ?? {}
      const resultImageUrl =
        first.url ?? (first.b64_json ? createDataUrlFromBase64(first.b64_json, imageState.format) : '')

      setImagePatch({
        submitting: false,
        result: data,
        resultImageUrl,
        requestPreview,
        curlCommand: buildCurl({ url: targetUrl, apiKey: imageState.apiKey, payload: requestPreview }),
        error: response.ok ? '' : data?.error?.message || '图片请求失败',
      })
    } catch (error) {
      setImagePatch({
        submitting: false,
        error: error instanceof Error ? error.message : '图片请求失败',
      })
    }
  }

  async function resolveSeedanceInput(file, url) {
    if (file) {
      return fileToDataUrl(file)
    }
    return url.trim()
  }

  async function submitVideo(event) {
    event.preventDefault()

    if (!API_BASE) {
      setVideoPatch({ error: '当前页面未配置工具 API 地址，视频功能暂不可用。' })
      return
    }

    setVideoPatch({
      submitting: true,
      error: '',
      result: null,
      taskId: '',
      polling: false,
      pollCount: 0,
    })

    try {
      const payload = {
        model: videoState.model,
        prompt: videoState.prompt,
        duration: Number(videoState.duration),
        resolution: videoState.resolution,
        aspect_ratio: videoState.aspectRatio,
        async: true,
      }

      if (videoState.realPersonMode) {
        payload.extra_body = { real_person_mode: true }
      }

      if (videoState.mode === 'image') {
        const frameValue = await resolveSeedanceInput(videoState.frameFile, videoState.frameUrl)

        if (!frameValue) {
          throw new Error('首帧是必填项；如果只想用首帧，就不要填写尾帧。')
        }

        payload.image = frameValue

        const tailValue = await resolveSeedanceInput(videoState.tailFile, videoState.tailUrl)
        if (tailValue) {
          payload.image_tail = tailValue
        }
      }

      if (videoState.mode === 'multi') {
        const textItems = videoState.multiText
          .split('\n')
          .map((item) => item.trim())
          .filter(Boolean)
        const fileItems = await Promise.all(videoState.multiFiles.map((file) => fileToDataUrl(file)))
        payload.images = [...textItems, ...fileItems]

        if (videoState.referenceVideoUrl.trim()) {
          payload.video = videoState.referenceVideoUrl.trim()
        }

        if (videoState.referenceAudioUrl.trim()) {
          payload.audio = videoState.referenceAudioUrl.trim()
        }
      }

      const response = await fetch(`${API_BASE}/api/tools/seedance/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl: normalizeBaseUrl(videoState.baseUrl),
          apiKey: videoState.apiKey,
          payload,
        }),
      })
      const data = await response.json()

      setVideoPatch({
        submitting: false,
        result: data,
        taskId: data.taskId || '',
        polling: Boolean(response.ok && data.taskId),
        requestPreview: payload,
        curlCommand: buildCurl({
          url: `${normalizeBaseUrl(videoState.baseUrl)}/api/v1/videos/generations`,
          apiKey: videoState.apiKey,
          payload,
        }),
        error: response.ok ? '' : data.message || data.error || '视频请求失败',
      })
    } catch (error) {
      setVideoPatch({
        submitting: false,
        error: error instanceof Error ? error.message : '视频请求失败',
      })
    }
  }

  async function createAssetGroup() {
    setVideoPatch({ assetSubmitting: true, error: '' })
    try {
      const response = await fetch(`${API_BASE}/api/tools/seedance/assets/groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl: normalizeBaseUrl(videoState.baseUrl),
          apiKey: videoState.apiKey,
          name: videoState.assetGroupName,
          platform: 'bytedance',
        }),
      })
      const data = await response.json()
      setVideoPatch({
        assetSubmitting: false,
        assetGroupId: data.groupId || '',
        assetStatus: data,
        error: response.ok ? '' : '素材组创建失败',
      })
    } catch {
      setVideoPatch({ assetSubmitting: false, error: '素材组创建失败' })
    }
  }

  async function createAsset() {
    setVideoPatch({ assetSubmitting: true, error: '' })
    try {
      const resolvedUrl =
        videoState.assetUrl.trim() || (videoState.assetFile ? await fileToDataUrl(videoState.assetFile) : '')

      const response = await fetch(`${API_BASE}/api/tools/seedance/assets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl: normalizeBaseUrl(videoState.baseUrl),
          apiKey: videoState.apiKey,
          group_id: videoState.assetGroupId,
          name: videoState.assetName,
          url: resolvedUrl,
          asset_type: 'Image',
          platform: 'bytedance',
        }),
      })
      const data = await response.json()
      setVideoPatch({
        assetSubmitting: false,
        assetTaskId: data.taskId || '',
        assetStatus: data,
        error: response.ok ? '' : '素材任务创建失败',
      })
    } catch {
      setVideoPatch({ assetSubmitting: false, error: '素材任务创建失败' })
    }
  }

  async function refreshAsset() {
    if (!videoState.assetTaskId) {
      setVideoPatch({ error: '请先创建素材任务' })
      return
    }

    setVideoPatch({ assetSubmitting: true, error: '' })
    try {
      const response = await fetch(`${API_BASE}/api/tools/seedance/assets/${encodeURIComponent(videoState.assetTaskId)}`, {
        headers: {
          'x-api-key': videoState.apiKey,
          'x-base-url': normalizeBaseUrl(videoState.baseUrl),
        },
      })
      const data = await response.json()
      const assetLink = data.assetId ? `asset://${data.assetId}` : ''
      const nextPatch = {
        assetSubmitting: false,
        assetStatus: data,
        error: response.ok ? '' : '素材状态查询失败',
      }

      if (response.ok && assetLink) {
        if (videoState.assetTarget === 'image') {
          nextPatch.frameUrl = assetLink
        }
        if (videoState.assetTarget === 'image_tail') {
          nextPatch.tailUrl = assetLink
        }
        if (videoState.assetTarget === 'images') {
          nextPatch.multiText = videoState.multiText ? `${videoState.multiText}\n${assetLink}` : assetLink
        }
      }

      setVideoPatch(nextPatch)
    } catch {
      setVideoPatch({ assetSubmitting: false, error: '素材状态查询失败' })
    }
  }

  return (
    <div className="app-shell">
      <header className="hero">
        <div className="hero-copy">
          <span className="eyebrow">AI Media Studio</span>
          <h1>{content?.site.title || 'AI 媒体工具工作台'}</h1>
          <p>
            {content?.site.subtitle ||
              '一个给普通用户直接使用的网页工具。支持 GPT Image 2 图片生成，以及 Seedance 视频生成与参考素材工作流。'}
          </p>
          <div className="hero-points">
            <span>GPT Image 2</span>
            <span>Seedance 2.0</span>
            <span>刷新即清空 Key</span>
          </div>
        </div>

        <div className="hero-guide">
          <div className="guide-card">
            <strong>使用步骤</strong>
            <ol>
              <li>选择图片生成或视频生成</li>
              <li>填写 API Base URL 和 Key</li>
              <li>输入 Prompt，按需上传参考素材</li>
              <li>点击生成，直接查看结果</li>
            </ol>
          </div>
        </div>
      </header>

      <main className="main-wrap">
        <div className="surface-switch">
          <button className={surface === 'image' ? 'surface-tab active' : 'surface-tab'} onClick={() => setSurface('image')}>
            图片生成
          </button>
          <button className={surface === 'video' ? 'surface-tab active' : 'surface-tab'} onClick={() => setSurface('video')}>
            视频生成
          </button>
        </div>

        {surface === 'image' && (
          <section className="tool-layout">
            <form className="tool-card tool-form" onSubmit={submitImage}>
              <div className="tool-head">
                <div>
                  <h2>图片生成</h2>
                  <p>当前只保留 `GPT Image 2`。文生图走 `/v1/images/generations`，图生图走 `/v1/images/edits`。</p>
                </div>
                <span className="badge">GPT Image 2</span>
              </div>

              <div className="info-list">
                <div>文生图参数：`model`、`prompt`、`size`、`quality`、`output_format`</div>
                <div>图生图上传参数：`image[]`，不是自定义字段名</div>
                <div>图生图接口路径：`/v1/images/edits`</div>
              </div>

              <div className="input-grid">
                <label>
                  API Base URL
                  <input value={imageState.baseUrl} onChange={(event) => setImagePatch({ baseUrl: event.target.value })} />
                </label>
                <label>
                  API Key
                  <input type="password" value={imageState.apiKey} placeholder="sk-..." onChange={(event) => setImagePatch({ apiKey: event.target.value })} />
                </label>
                <label>
                  模型
                  <input value={IMAGE_MODEL.label} disabled />
                </label>
                <label>
                  模式
                  <select value={imageState.mode} onChange={(event) => setImagePatch({ mode: event.target.value, result: null, error: '' })}>
                    {imageModes.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="span-2">
                  Prompt
                  <textarea rows="5" value={imageState.prompt} placeholder="描述你想生成的画面内容" onChange={(event) => setImagePatch({ prompt: event.target.value })} />
                </label>
                <label>
                  尺寸
                  <select value={imageState.size} onChange={(event) => setImagePatch({ size: event.target.value })}>
                    {imageSizeOptions.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  质量
                  <select value={imageState.quality} onChange={(event) => setImagePatch({ quality: event.target.value })}>
                    {imageQualityOptions.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  格式
                  <select value={imageState.format} onChange={(event) => setImagePatch({ format: event.target.value })}>
                    {imageFormatOptions.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {imageState.mode === 'edit' && (
                <div className="support-box">
                  <h3>参考图片</h3>
                  <div className="support-copy">
                    上传本地文件时，前端会按 `image[]` 提交；填写 URL 时，会先读取远程图片再按相同参数上传。
                  </div>
                  <div className="input-grid">
                    <label>
                      上传图片
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(event) => {
                          const file = event.target.files?.[0] ?? null
                          setImagePatch({
                            imageFile: file,
                            previewUrl: file ? URL.createObjectURL(file) : '',
                          })
                        }}
                      />
                    </label>
                    <label>
                      或填写图片 URL
                      <input value={imageState.imageUrl} placeholder="https://example.com/image.png" onChange={(event) => setImagePatch({ imageUrl: event.target.value })} />
                    </label>
                  </div>
                  {imageState.previewUrl && (
                    <div className="preview-box">
                      <img src={imageState.previewUrl} alt="reference preview" />
                    </div>
                  )}
                </div>
              )}

              {imageState.error && <div className="error-box">{imageState.error}</div>}

              <button className="primary-button" type="submit" disabled={imageState.submitting}>
                {imageState.submitting ? '生成中...' : '开始生成图片'}
              </button>
            </form>

            <div className="tool-card tool-result">
              <div className="tool-head">
                <div>
                  <h2>生成结果</h2>
                  <p>成功后优先显示最终图片，技术细节收在开发者信息里。</p>
                </div>
              </div>

              {imageState.resultImageUrl ? (
                <div className="hero-result">
                  <img src={imageState.resultImageUrl} alt="generated result" />
                  <a href={imageState.resultImageUrl} target="_blank" rel="noreferrer">
                    单独打开图片
                  </a>
                </div>
              ) : (
                <div className="empty-box">生成成功后，这里会展示图片结果。</div>
              )}

              {(imageState.result || imageState.requestPreview || imageState.curlCommand) && (
                <details className="developer-box">
                  <summary>开发者信息</summary>
                  {imageState.requestPreview && (
                    <ResultShell title="请求 JSON">
                      <pre>{JSON.stringify(imageState.requestPreview, null, 2)}</pre>
                    </ResultShell>
                  )}
                  {imageState.curlCommand && (
                    <ResultShell title="curl">
                      <pre>{imageState.curlCommand}</pre>
                    </ResultShell>
                  )}
                  {imageState.result && (
                    <ResultShell title="原始响应">
                      <pre>{JSON.stringify(imageState.result, null, 2)}</pre>
                    </ResultShell>
                  )}
                </details>
              )}
            </div>
          </section>
        )}

        {surface === 'video' && (
          <section className="tool-layout">
            <form className="tool-card tool-form" onSubmit={submitVideo}>
              <div className="tool-head">
                <div>
                  <h2>视频生成</h2>
                  <p>首帧和尾帧不是冲突项。`image` 是首帧，`image_tail` 是尾帧；只填首帧就是首帧模式，首尾都填就是首尾帧模式。</p>
                </div>
                <span className="badge blue">Seedance</span>
              </div>

              <div className="info-list">
                <div>文生视频：只传 `model`、`prompt`、`duration`、`resolution`、`aspect_ratio`</div>
                <div>首帧模式：增加 `image`</div>
                <div>首尾帧模式：同时传 `image` + `image_tail`</div>
                <div>多参考模式：使用 `images`，可再叠加 `video`、`audio`</div>
                <div>真人模式：增加 `extra_body.real_person_mode = true`</div>
              </div>

              <div className="input-grid">
                <label>
                  API Base URL
                  <input value={videoState.baseUrl} onChange={(event) => setVideoPatch({ baseUrl: event.target.value })} />
                </label>
                <label>
                  API Key
                  <input type="password" value={videoState.apiKey} placeholder="请输入上游 Key" onChange={(event) => setVideoPatch({ apiKey: event.target.value })} />
                </label>
                <label>
                  模型
                  <select
                    value={videoState.model}
                    onChange={(event) => {
                      const nextModel = videoModels.find((item) => item.id === event.target.value) ?? videoModels[0]
                      setVideoPatch({
                        model: nextModel.id,
                        resolution: nextModel.resolutions.includes(videoState.resolution)
                          ? videoState.resolution
                          : nextModel.resolutions[nextModel.resolutions.length - 1],
                      })
                    }}
                  >
                    {videoModels.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  模式
                  <select value={videoState.mode} onChange={(event) => setVideoPatch({ mode: event.target.value, result: null, error: '' })}>
                    {videoModes.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="span-2">
                  Prompt
                  <textarea rows="5" value={videoState.prompt} placeholder="描述你想生成的视频内容" onChange={(event) => setVideoPatch({ prompt: event.target.value })} />
                </label>
                <label>
                  时长
                  <input type="number" min="4" max="15" value={videoState.duration} onChange={(event) => setVideoPatch({ duration: event.target.value })} />
                </label>
                <label>
                  分辨率
                  <select value={videoState.resolution} onChange={(event) => setVideoPatch({ resolution: event.target.value })}>
                    {activeVideoModel.resolutions.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  宽高比
                  <select value={videoState.aspectRatio} onChange={(event) => setVideoPatch({ aspectRatio: event.target.value })}>
                    {aspectRatioOptions.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="checkbox-row">
                  <span>真人模式</span>
                  <input type="checkbox" checked={videoState.realPersonMode} onChange={(event) => setVideoPatch({ realPersonMode: event.target.checked })} />
                </label>
              </div>

              {videoState.mode === 'image' && (
                <div className="support-box">
                  <h3>首帧 / 尾帧</h3>
                  <div className="support-copy">
                    首帧是必填。尾帧是可选项，不是互斥项：
                    不填尾帧 = 首帧生视频；
                    填了尾帧 = 首尾帧生视频。
                  </div>
                  <div className="input-grid">
                    <label>
                      首帧上传
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(event) => {
                          const file = event.target.files?.[0] ?? null
                          setVideoPatch({
                            frameFile: file,
                            framePreviewUrl: file ? URL.createObjectURL(file) : '',
                          })
                        }}
                      />
                    </label>
                    <label>
                      首帧 URL 或 asset://
                      <input value={videoState.frameUrl} placeholder="https://example.com/frame.png 或 asset://..." onChange={(event) => setVideoPatch({ frameUrl: event.target.value })} />
                    </label>
                    <label>
                      尾帧上传
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(event) => {
                          const file = event.target.files?.[0] ?? null
                          setVideoPatch({
                            tailFile: file,
                            tailPreviewUrl: file ? URL.createObjectURL(file) : '',
                          })
                        }}
                      />
                    </label>
                    <label>
                      尾帧 URL 或 asset://
                      <input value={videoState.tailUrl} placeholder="https://example.com/tail.png 或 asset://..." onChange={(event) => setVideoPatch({ tailUrl: event.target.value })} />
                    </label>
                  </div>

                  {(videoState.framePreviewUrl || videoState.tailPreviewUrl) && (
                    <div className="dual-preview">
                      {videoState.framePreviewUrl && <img src={videoState.framePreviewUrl} alt="frame preview" />}
                      {videoState.tailPreviewUrl && <img src={videoState.tailPreviewUrl} alt="tail preview" />}
                    </div>
                  )}
                </div>
              )}

              {videoState.mode === 'multi' && (
                <div className="support-box">
                  <h3>多参考输入</h3>
                  <div className="support-copy">
                    `images` 用于参考图列表；`video` 和 `audio` 是可选增强项。不能只传音频不传图片或视频。
                  </div>
                  <div className="input-grid">
                    <label className="span-2">
                      参考图 URL / asset:// 列表
                      <textarea rows="4" value={videoState.multiText} placeholder="每行一条 URL 或 asset://..." onChange={(event) => setVideoPatch({ multiText: event.target.value })} />
                    </label>
                    <label className="span-2">
                      本地参考图上传
                      <input
                        type="file"
                        multiple
                        accept="image/*"
                        onChange={(event) => {
                          const files = Array.from(event.target.files ?? [])
                          setVideoPatch({
                            multiFiles: files,
                            multiPreviewUrls: files.map((file) => URL.createObjectURL(file)),
                          })
                        }}
                      />
                    </label>
                    <label>
                      参考视频 URL
                      <input value={videoState.referenceVideoUrl} placeholder="https://example.com/reference.mp4" onChange={(event) => setVideoPatch({ referenceVideoUrl: event.target.value })} />
                    </label>
                    <label>
                      参考音频 URL
                      <input value={videoState.referenceAudioUrl} placeholder="https://example.com/reference.mp3" onChange={(event) => setVideoPatch({ referenceAudioUrl: event.target.value })} />
                    </label>
                  </div>

                  {videoState.multiPreviewUrls.length > 0 && (
                    <div className="gallery-preview">
                      {videoState.multiPreviewUrls.map((item) => (
                        <img key={item} src={item} alt="multi reference" />
                      ))}
                    </div>
                  )}
                </div>
              )}

              <details className="support-box compact">
                <summary>高级素材模式</summary>
                <div className="support-copy">
                  如果参考图里有人脸，建议先走素材工作流。素材创建接口的关键参数是 `url`，创建成功后再把返回的 `asset://...` 回填到 `image`、`image_tail` 或 `images`。
                </div>
                <div className="input-grid spaced">
                  <label>
                    素材组名称
                    <input value={videoState.assetGroupName} onChange={(event) => setVideoPatch({ assetGroupName: event.target.value })} />
                  </label>
                  <label>
                    素材组 ID
                    <input value={videoState.assetGroupId} onChange={(event) => setVideoPatch({ assetGroupId: event.target.value })} />
                  </label>
                  <label>
                    素材名称
                    <input value={videoState.assetName} onChange={(event) => setVideoPatch({ assetName: event.target.value })} />
                  </label>
                  <label>
                    回填目标
                    <select value={videoState.assetTarget} onChange={(event) => setVideoPatch({ assetTarget: event.target.value })}>
                      <option value="image">首帧 image</option>
                      <option value="image_tail">尾帧 image_tail</option>
                      <option value="images">参考图列表 images</option>
                    </select>
                  </label>
                  <label className="span-2">
                    素材 URL
                    <input value={videoState.assetUrl} placeholder="https://example.com/asset.png" onChange={(event) => setVideoPatch({ assetUrl: event.target.value })} />
                  </label>
                  <label className="span-2">
                    本地素材文件
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(event) => {
                        const file = event.target.files?.[0] ?? null
                        setVideoPatch({
                          assetFile: file,
                          assetPreviewUrl: file ? URL.createObjectURL(file) : '',
                        })
                      }}
                    />
                  </label>
                </div>

                {videoState.assetPreviewUrl && (
                  <div className="preview-box">
                    <img src={videoState.assetPreviewUrl} alt="asset preview" />
                  </div>
                )}

                <div className="mini-actions">
                  <button type="button" className="secondary-button" onClick={createAssetGroup}>
                    创建素材组
                  </button>
                  <button type="button" className="secondary-button" onClick={createAsset}>
                    创建素材任务
                  </button>
                  <button type="button" className="secondary-button" onClick={refreshAsset}>
                    查询并回填
                  </button>
                </div>
              </details>

              {videoState.error && <div className="error-box">{videoState.error}</div>}

              <button className="primary-button" type="submit" disabled={videoState.submitting}>
                {videoState.submitting ? '提交中...' : '开始生成视频'}
              </button>
            </form>

            <div className="tool-card tool-result">
              <div className="tool-head">
                <div>
                  <h2>生成结果</h2>
                  <p>先看任务状态和最终视频，技术细节默认隐藏。</p>
                </div>
              </div>

              <div className="status-strip">
                <span>模式：{videoModes.find((item) => item.id === videoState.mode)?.label}</span>
                <span>状态：{videoState.result?.state || videoState.result?.data?.status || '未提交'}</span>
                <span>轮询：{videoState.polling ? `进行中 ${videoState.pollCount}` : '未开始'}</span>
              </div>

              {videoState.result?.outputUrl ? (
                <div className="hero-result">
                  <video controls src={videoState.result.outputUrl} />
                  <a href={videoState.result.outputUrl} target="_blank" rel="noreferrer">
                    单独打开视频
                  </a>
                </div>
              ) : (
                <div className="empty-box">提交视频任务后，这里会显示生成结果。</div>
              )}

              {(videoState.result || videoState.requestPreview || videoState.curlCommand || videoState.assetStatus) && (
                <details className="developer-box">
                  <summary>开发者信息</summary>
                  {videoState.requestPreview && (
                    <ResultShell title="请求 JSON">
                      <pre>{JSON.stringify(videoState.requestPreview, null, 2)}</pre>
                    </ResultShell>
                  )}
                  {videoState.curlCommand && (
                    <ResultShell title="curl">
                      <pre>{videoState.curlCommand}</pre>
                    </ResultShell>
                  )}
                  {videoState.assetStatus && (
                    <ResultShell title="素材状态">
                      <pre>{JSON.stringify(videoState.assetStatus, null, 2)}</pre>
                    </ResultShell>
                  )}
                  {videoState.result && (
                    <ResultShell title="原始响应">
                      <pre>{JSON.stringify(videoState.result, null, 2)}</pre>
                    </ResultShell>
                  )}
                </details>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

export default App
