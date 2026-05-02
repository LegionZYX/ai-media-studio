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
  { id: 'image', label: '首帧 / 首尾帧' },
  { id: 'multi', label: '多参考素材' },
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

function parseLines(value) {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
}

function createDataUrlFromBase64(base64Value, format) {
  const mimeType = format === 'jpeg' ? 'image/jpeg' : `image/${format || 'png'}`
  return `data:${mimeType};base64,${base64Value}`
}

function buildJsonCurl({ url, apiKey, payload }) {
  return `curl -X POST "${url}" -H "Authorization: Bearer ${apiKey || 'YOUR_API_KEY'}" -H "Content-Type: application/json" -d '${JSON.stringify(payload, null, 2)}'`
}

function buildImageEditCurl({ url, apiKey, payload, fileCount }) {
  return [
    `curl -X POST "${url}" \\`,
    `  -H "Authorization: Bearer ${apiKey || 'YOUR_API_KEY'}" \\`,
    `  -F "model=${payload.model}" \\`,
    `  -F "prompt=${payload.prompt}" \\`,
    `  -F "size=${payload.size}" \\`,
    `  -F "quality=${payload.quality}" \\`,
    `  -F "output_format=${payload.output_format}" \\`,
    `  -F "image[]=@your-file-1.png"${fileCount > 1 ? ' \\\n  -F "image[]=@your-file-2.png"' : ''}`,
  ].join('\n')
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
    throw new Error(`无法读取远程图片：${url}`)
  }

  const blob = await response.blob()
  const name = url.split('/').pop() || 'reference-image.png'
  return new File([blob], name, { type: blob.type || 'image/png' })
}

async function resolveSeedanceInput(file, url) {
  if (file) {
    return fileToDataUrl(file)
  }
  return url.trim()
}

function getSeedanceVideoUrl(result) {
  if (!result) {
    return ''
  }

  return (
    result.videoUrl ||
    result.url ||
    result.data?.video_url ||
    result.data?.url ||
    result.data?.result?.video_url ||
    result.data?.result?.url ||
    result.raw?.data?.video_url ||
    result.raw?.data?.url ||
    ''
  )
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
    imageFiles: [],
    imagePreviewUrls: [],
    imageUrlText: '',
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
    referenceVideoText: '',
    referenceAudioText: '',
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
    assetGroupName: '演示素材组',
    assetName: '参考图素材',
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
        const state = data.state ?? data.data?.status ?? data.raw?.data?.status ?? ''
        const stop = ['succeed', 'completed', 'failed', 'error', 'cancelled', 'canceled'].includes(state)

        setVideoState((current) => ({
          ...current,
          result: data,
          pollCount: current.pollCount + 1,
          polling: !stop && current.pollCount + 1 < 30,
          error: response.ok ? current.error : data.message || '轮询任务状态失败',
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
        const urlFiles = await Promise.all(parseLines(imageState.imageUrlText).map((item) => remoteUrlToFile(item)))
        const sourceFiles = [...imageState.imageFiles, ...urlFiles]

        if (sourceFiles.length === 0) {
          throw new Error('图生图至少要提供 1 张参考图，可以上传文件，也可以填写远程图片 URL。')
        }

        const formData = new FormData()
        formData.append('model', IMAGE_MODEL.id)
        formData.append('prompt', imageState.prompt)
        formData.append('size', imageState.size)
        formData.append('quality', imageState.quality)
        formData.append('output_format', imageState.format)
        sourceFiles.forEach((file) => {
          formData.append('image[]', file)
        })

        requestPreview = {
          model: IMAGE_MODEL.id,
          prompt: imageState.prompt,
          size: imageState.size,
          quality: imageState.quality,
          output_format: imageState.format,
          image_field: 'image[]',
          local_file_count: imageState.imageFiles.length,
          remote_url_count: urlFiles.length,
          total_images: sourceFiles.length,
        }

        response = await fetch(targetUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${imageState.apiKey}`,
          },
          body: formData,
        })

        const data = await response.json()
        const first = data?.data?.[0] ?? {}
        const resultImageUrl =
          first.url ?? (first.b64_json ? createDataUrlFromBase64(first.b64_json, imageState.format) : '')

        setImagePatch({
          submitting: false,
          result: data,
          resultImageUrl,
          requestPreview,
          curlCommand: buildImageEditCurl({
            url: targetUrl,
            apiKey: imageState.apiKey,
            payload: requestPreview,
            fileCount: sourceFiles.length,
          }),
          error: response.ok ? '' : data?.error?.message || '图生图请求失败',
        })
        return
      }

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

      const data = await response.json()
      const first = data?.data?.[0] ?? {}
      const resultImageUrl =
        first.url ?? (first.b64_json ? createDataUrlFromBase64(first.b64_json, imageState.format) : '')

      setImagePatch({
        submitting: false,
        result: data,
        resultImageUrl,
        requestPreview,
        curlCommand: buildJsonCurl({ url: targetUrl, apiKey: imageState.apiKey, payload: requestPreview }),
        error: response.ok ? '' : data?.error?.message || '图片请求失败',
      })
    } catch (error) {
      setImagePatch({
        submitting: false,
        error: error instanceof Error ? error.message : '图片请求失败',
      })
    }
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
          throw new Error('首帧是必填项。只做首帧视频时填写 image；需要尾帧过渡时再额外填写 image_tail。')
        }

        payload.image = frameValue

        const tailValue = await resolveSeedanceInput(videoState.tailFile, videoState.tailUrl)
        if (tailValue) {
          payload.image_tail = tailValue
        }
      }

      if (videoState.mode === 'multi') {
        const imageUrls = parseLines(videoState.multiText)
        const imageFiles = await Promise.all(videoState.multiFiles.map((file) => fileToDataUrl(file)))
        const videos = parseLines(videoState.referenceVideoText)
        const audios = parseLines(videoState.referenceAudioText)
        const images = [...imageUrls, ...imageFiles]

        if (images.length > 9) {
          throw new Error('多参考模式最多支持 9 张参考图。')
        }

        if (videos.length > 3) {
          throw new Error('多参考模式最多支持 3 个参考视频 URL。')
        }

        if (audios.length > 3) {
          throw new Error('多参考模式最多支持 3 个参考音频 URL。')
        }

        if (audios.length > 0 && images.length === 0 && videos.length === 0) {
          throw new Error('不能只传音频。多参考模式至少需要参考图或参考视频。')
        }

        if (images.length > 0) {
          payload.images = images
        }

        if (videos.length === 1) {
          payload.video = videos[0]
        }

        if (videos.length > 1) {
          payload.videos = videos
        }

        if (audios.length === 1) {
          payload.audio = audios[0]
        }

        if (audios.length > 1) {
          payload.audios = audios
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
        curlCommand: buildJsonCurl({
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

      if (!resolvedUrl) {
        throw new Error('请提供素材 URL，或上传 1 个本地素材文件。')
      }

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
    } catch (error) {
      setVideoPatch({
        assetSubmitting: false,
        error: error instanceof Error ? error.message : '素材任务创建失败',
      })
    }
  }

  async function refreshAsset() {
    if (!videoState.assetTaskId) {
      setVideoPatch({ error: '请先创建素材任务。' })
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

  async function uploadFileToAiai({ file, name, groupIdOverride = '' }) {
    if (!API_BASE) {
      throw new Error('当前页面未配置工具 API 地址，无法上传到 AIAI。')
    }

    if (!file) {
      throw new Error('请先选择本地文件。')
    }

    const formData = new FormData()
    formData.append('baseUrl', normalizeBaseUrl(videoState.baseUrl))
    formData.append('apiKey', videoState.apiKey)

    if (groupIdOverride || videoState.assetGroupId) {
      formData.append('group_id', groupIdOverride || videoState.assetGroupId)
    } else {
      formData.append('group_name', videoState.assetGroupName)
    }

    formData.append('name', name)
    formData.append('asset_type', 'Image')
    formData.append('platform', 'bytedance')
    formData.append('file', file)

    const response = await fetch(`${API_BASE}/api/tools/seedance/assets/upload`, {
      method: 'POST',
      body: formData,
    })
    const data = await response.json()

    if (!response.ok || !data.assetRef) {
      throw new Error(data.message || data.error || '上传到 AIAI 失败')
    }

    return data
  }

  async function uploadSelectedAsset(target, file, name) {
    setVideoPatch({ assetSubmitting: true, error: '' })

    try {
      const data = await uploadFileToAiai({ file, name })
      const nextPatch = {
        assetSubmitting: false,
        assetGroupId: data.groupId || videoState.assetGroupId,
        assetTaskId: data.taskId || '',
        assetStatus: data.data || data,
      }

      if (target === 'image') {
        nextPatch.frameUrl = data.assetRef
      }

      if (target === 'image_tail') {
        nextPatch.tailUrl = data.assetRef
      }

      setVideoPatch(nextPatch)
    } catch (error) {
      setVideoPatch({
        assetSubmitting: false,
        error: error instanceof Error ? error.message : '上传到 AIAI 失败',
      })
    }
  }

  async function uploadMultiFilesToAiai() {
    if (videoState.multiFiles.length === 0) {
      setVideoPatch({ error: '请先选择本地参考图。' })
      return
    }

    setVideoPatch({ assetSubmitting: true, error: '' })

    try {
      let groupId = videoState.assetGroupId
      const refs = []
      let lastStatus = null
      let lastTaskId = ''

      for (let index = 0; index < videoState.multiFiles.length; index += 1) {
        const file = videoState.multiFiles[index]
        const data = await uploadFileToAiai({
          file,
          name: `${videoState.assetName}-${index + 1}`,
          groupIdOverride: groupId,
        })
        groupId = data.groupId || groupId
        lastStatus = data.data || data
        lastTaskId = data.taskId || lastTaskId
        refs.push(data.assetRef)
      }

      setVideoPatch({
        assetSubmitting: false,
        assetGroupId: groupId,
        assetTaskId: lastTaskId,
        assetStatus: lastStatus,
        multiText: videoState.multiText ? `${videoState.multiText}\n${refs.join('\n')}` : refs.join('\n'),
      })
    } catch (error) {
      setVideoPatch({
        assetSubmitting: false,
        error: error instanceof Error ? error.message : '批量上传到 AIAI 失败',
      })
    }
  }

  const imageRemoteCount = parseLines(imageState.imageUrlText).length
  const videoImageCount = parseLines(videoState.multiText).length + videoState.multiFiles.length
  const videoUrlCount = parseLines(videoState.referenceVideoText).length
  const audioUrlCount = parseLines(videoState.referenceAudioText).length
  const generatedVideoUrl = getSeedanceVideoUrl(videoState.result)

  return (
    <div className="app-shell">
      <header className="hero">
        <div className="hero-copy">
          <span className="eyebrow">AI Media Studio</span>
          <h1>{content?.site?.title || 'AI 媒体工具台'}</h1>
          <p>
            {content?.site?.subtitle ||
              '给普通用户直接使用的图片与视频生成页面。当前图片侧只保留 GPT Image 2；视频侧聚焦 Seedance 2.0，并把首帧、尾帧、多参考素材和素材资产流程全部讲清楚。'}
          </p>
          <div className="hero-points">
            <span>仅保留 GPT Image 2</span>
            <span>支持图生图多素材上传</span>
            <span>Seedance 参考图上限已写清</span>
          </div>
        </div>

        <div className="hero-guide">
          <div className="guide-card">
            <strong>先看这 4 点</strong>
            <ol>
              <li>文生图不需要上传素材，只有图生图才需要参考图。</li>
              <li>图生图本地上传会严格按 <code>image[]</code> 提交，可同时传多张。</li>
              <li>视频首帧和尾帧不冲突：<code>image</code> 是首帧，<code>image_tail</code> 是可选尾帧。</li>
              <li>多参考模式最多支持 9 张图、3 个视频 URL、3 个音频 URL。</li>
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
                  <p>当前只支持 <code>gpt-image-2</code>。文生图走 <code>/v1/images/generations</code>，图生图走 <code>/v1/images/edits</code>。</p>
                </div>
                <span className="badge">GPT Image 2</span>
              </div>

              <div className="note-box">
                <strong>上传规则</strong>
                <ul className="hint-list">
                  <li>文生图无需上传素材，只填写 Prompt 即可。</li>
                  <li>图生图本地文件会用重复的 <code>image[]</code> 字段提交，不使用自定义字段名。</li>
                  <li>如果你填写的是远程图片 URL，页面会先读取远程图片，再按同样的 <code>image[]</code> 方式上传。</li>
                </ul>
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
                  <textarea rows="5" value={imageState.prompt} placeholder="描述你想生成或修改的画面内容" onChange={(event) => setImagePatch({ prompt: event.target.value })} />
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
                  输出格式
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
                  <h3>图生图素材上传</h3>
                  <div className="stat-grid">
                    <div>
                      <strong>{imageState.imageFiles.length}</strong>
                      <span>本地图片</span>
                    </div>
                    <div>
                      <strong>{imageRemoteCount}</strong>
                      <span>远程 URL</span>
                    </div>
                    <div>
                      <strong>{imageState.imageFiles.length + imageRemoteCount}</strong>
                      <span>总素材数</span>
                    </div>
                  </div>
                  <div className="support-copy">
                    这里就是图生图的素材入口。你可以同时上传多张本地图，也可以粘贴多行远程 URL。提交时页面会把它们统一转换成重复的 <code>image[]</code> 参数。
                  </div>
                  <div className="input-grid">
                    <label className="span-2">
                      上传本地参考图
                      <input
                        type="file"
                        multiple
                        accept="image/*"
                        onChange={(event) => {
                          const files = Array.from(event.target.files ?? [])
                          setImagePatch({
                            imageFiles: files,
                            imagePreviewUrls: files.map((file) => URL.createObjectURL(file)),
                          })
                        }}
                      />
                    </label>
                    <label className="span-2">
                      远程图片 URL 列表
                      <textarea
                        rows="4"
                        value={imageState.imageUrlText}
                        placeholder="每行 1 个 URL，例如：https://example.com/reference-1.png"
                        onChange={(event) => setImagePatch({ imageUrlText: event.target.value })}
                      />
                    </label>
                  </div>

                  {imageState.imagePreviewUrls.length > 0 && (
                    <div className="gallery-preview">
                      {imageState.imagePreviewUrls.map((item) => (
                        <img key={item} src={item} alt="image edit reference" />
                      ))}
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
                  <h2>结果区</h2>
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
                <div className="empty-box">生成成功后，这里会显示图片结果。</div>
              )}

              {(imageState.result || imageState.requestPreview || imageState.curlCommand) && (
                <details className="developer-box">
                  <summary>开发者信息</summary>
                  {imageState.requestPreview && (
                    <ResultShell title="请求预览">
                      <pre>{JSON.stringify(imageState.requestPreview, null, 2)}</pre>
                    </ResultShell>
                  )}
                  {imageState.curlCommand && (
                    <ResultShell title="curl 参考">
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
                  <p>这页只保留用户最常用的 3 种模式：文生视频、首帧 / 首尾帧、多参考素材。其余复杂逻辑放进素材资产折叠区。</p>
                </div>
                <span className="badge blue">Seedance</span>
              </div>

              <div className="note-box">
                <strong>先把这几个概念记住</strong>
                <ul className="hint-list">
                  <li><code>image</code> 是首帧，必填时就代表“首帧生视频”。</li>
                  <li><code>image_tail</code> 是尾帧，可选；填写后就会变成“首尾帧过渡视频”。</li>
                  <li>多参考模式里，参考图最多 9 张，参考视频 URL 最多 3 个，参考音频 URL 最多 3 个。</li>
                  <li>本地文件默认不会先独立上传到服务器，而是由浏览器读取后直接进入本次生成请求；只有你使用“素材资产模式”时，才会单独创建 <code>asset://...</code>。</li>
                </ul>
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
                  <h3>首帧 / 尾帧输入</h3>
                  <div className="support-copy">
                    首帧和尾帧不冲突。首帧是必填，尾帧是可选。只传首帧就是普通首帧生视频；首帧和尾帧都传时，就是首尾帧过渡模式。
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

                  <div className="mini-actions">
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={videoState.assetSubmitting || !videoState.frameFile}
                      onClick={() => uploadSelectedAsset('image', videoState.frameFile, '首帧素材')}
                    >
                      上传首帧到 AIAI
                    </button>
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={videoState.assetSubmitting || !videoState.tailFile}
                      onClick={() => uploadSelectedAsset('image_tail', videoState.tailFile, '尾帧素材')}
                    >
                      上传尾帧到 AIAI
                    </button>
                  </div>
                </div>
              )}

              {videoState.mode === 'multi' && (
                <div className="support-box">
                  <h3>多参考素材</h3>
                  <div className="stat-grid">
                    <div>
                      <strong>{videoImageCount}</strong>
                      <span>参考图 / 9</span>
                    </div>
                    <div>
                      <strong>{videoUrlCount}</strong>
                      <span>参考视频 / 3</span>
                    </div>
                    <div>
                      <strong>{audioUrlCount}</strong>
                      <span>参考音频 / 3</span>
                    </div>
                  </div>
                  <div className="support-copy">
                    图和视频都可以做参考。常规用户优先用这里的“直接上传 / 直接填 URL”；如果你手里只有本地图片，不想自己做公网 URL，可以直接点下面的“批量上传到 AIAI”，页面会自动回填 <code>asset://...</code>。
                  </div>
                  <div className="input-grid">
                    <label className="span-2">
                      参考图 URL / asset:// 列表
                      <textarea rows="4" value={videoState.multiText} placeholder="每行 1 个 URL 或 asset://..." onChange={(event) => setVideoPatch({ multiText: event.target.value })} />
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
                    <label className="span-2">
                      参考视频 URL 列表
                      <textarea rows="3" value={videoState.referenceVideoText} placeholder="每行 1 个视频 URL，最多 3 行" onChange={(event) => setVideoPatch({ referenceVideoText: event.target.value })} />
                    </label>
                    <label className="span-2">
                      参考音频 URL 列表
                      <textarea rows="3" value={videoState.referenceAudioText} placeholder="每行 1 个音频 URL，最多 3 行" onChange={(event) => setVideoPatch({ referenceAudioText: event.target.value })} />
                    </label>
                  </div>

                  {videoState.multiPreviewUrls.length > 0 && (
                    <div className="gallery-preview">
                      {videoState.multiPreviewUrls.map((item) => (
                        <img key={item} src={item} alt="multi reference" />
                      ))}
                    </div>
                  )}

                  <div className="mini-actions">
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={videoState.assetSubmitting || videoState.multiFiles.length === 0}
                      onClick={uploadMultiFilesToAiai}
                    >
                      批量上传本地参考图到 AIAI
                    </button>
                  </div>
                </div>
              )}

              <details className="support-box compact">
                <summary>高级素材模式：需要 asset://... 时再展开</summary>
                <div className="step-list">
                  <div>1. 现在你可以直接上传本地文件到 AIAI，不需要自己准备公网 URL。</div>
                  <div>2. 后端会自动创建素材组、创建素材任务、轮询任务状态。</div>
                  <div>3. 成功后页面会直接拿到 <code>asset://...</code> 并回填。</div>
                  <div>4. 如果你本来就有现成的素材 URL，也仍然可以在这里手动走 <code>url</code> 模式。</div>
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
                      <option value="images">参考图数组 images</option>
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
                  <button className="secondary-button" type="button" onClick={createAssetGroup} disabled={videoState.assetSubmitting}>
                    创建素材组
                  </button>
                  <button className="secondary-button" type="button" onClick={createAsset} disabled={videoState.assetSubmitting}>
                    创建素材任务
                  </button>
                  <button className="secondary-button" type="button" onClick={refreshAsset} disabled={videoState.assetSubmitting}>
                    查询素材状态并回填
                  </button>
                </div>

                {videoState.assetStatus && (
                  <ResultShell title="素材任务状态">
                    <pre>{JSON.stringify(videoState.assetStatus, null, 2)}</pre>
                  </ResultShell>
                )}
              </details>

              {videoState.error && <div className="error-box">{videoState.error}</div>}

              <button className="primary-button" type="submit" disabled={videoState.submitting}>
                {videoState.submitting ? '提交中...' : '开始生成视频'}
              </button>
            </form>

            <div className="tool-card tool-result">
              <div className="tool-head">
                <div>
                  <h2>结果区</h2>
                  <p>提交后会显示任务状态；如果上游返回最终视频地址，这里会直接预览。</p>
                </div>
              </div>

              <div className="status-strip">
                <span>模式：{videoModes.find((item) => item.id === videoState.mode)?.label || '未选择'}</span>
                <span>真人模式：{videoState.realPersonMode ? '已开启' : '未开启'}</span>
                <span>任务 ID：{videoState.taskId || '未生成'}</span>
                <span>轮询次数：{videoState.pollCount}</span>
              </div>

              {generatedVideoUrl ? (
                <div className="hero-result">
                  <video controls src={generatedVideoUrl} />
                  <a href={generatedVideoUrl} target="_blank" rel="noreferrer">
                    单独打开视频
                  </a>
                </div>
              ) : (
                <div className="empty-box">生成成功后，这里会显示视频预览或上游返回的结果地址。</div>
              )}

              {(videoState.result || videoState.requestPreview || videoState.curlCommand) && (
                <details className="developer-box">
                  <summary>开发者信息</summary>
                  {videoState.requestPreview && (
                    <ResultShell title="请求预览">
                      <pre>{JSON.stringify(videoState.requestPreview, null, 2)}</pre>
                    </ResultShell>
                  )}
                  {videoState.curlCommand && (
                    <ResultShell title="curl 参考">
                      <pre>{videoState.curlCommand}</pre>
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
