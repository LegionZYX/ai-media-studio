import { useEffect, useState } from 'react'
import './App.css'

const API_BASE = (import.meta.env.VITE_TOOL_API_BASE || 'http://127.0.0.1:8787').replace(/\/+$/, '')

const EMPTY_CONTENT = {
  site: {
    title: '',
    subtitle: '',
    primaryAction: '',
    secondaryAction: '',
  },
  metrics: [],
  services: [],
  sections: [],
  faq: [],
}

function App() {
  const [content, setContent] = useState(EMPTY_CONTENT)
  const [status, setStatus] = useState('loading')
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('site')

  useEffect(() => {
    let active = true

    async function loadContent() {
      try {
        const response = await fetch(`${API_BASE}/api/content`)
        const data = await response.json()

        if (active) {
          setContent(data)
          setStatus('ready')
        }
      } catch {
        if (active) {
          setStatus('error')
        }
      }
    }

    loadContent()

    return () => {
      active = false
    }
  }, [])

  const updateSiteField = (field, value) => {
    setContent((current) => ({
      ...current,
      site: {
        ...current.site,
        [field]: value,
      },
    }))
  }

  const updateCollectionItem = (collection, index, field, value) => {
    setContent((current) => ({
      ...current,
      [collection]: current[collection].map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item,
      ),
    }))
  }

  const saveContent = async () => {
    setSaving(true)

    try {
      const response = await fetch(`${API_BASE}/api/content`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(content),
      })

      if (!response.ok) {
        throw new Error('save failed')
      }

      setSaving(false)
    } catch {
      setSaving(false)
      window.alert('保存失败，请先确认 API 服务已经启动。')
    }
  }

  if (status === 'loading') {
    return <div className="screen-state">后台加载中...</div>
  }

  if (status === 'error') {
    return <div className="screen-state">无法连接 API，请先启动 api 服务。</div>
  }

  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-mark">CMS</div>
          <div>
            <strong>Content Admin</strong>
            <span>前后台分离管理台</span>
          </div>
        </div>

        <div className="sidebar-tabs">
          <button className={activeTab === 'site' ? 'active' : ''} onClick={() => setActiveTab('site')}>
            首页设置
          </button>
          <button className={activeTab === 'services' ? 'active' : ''} onClick={() => setActiveTab('services')}>
            服务管理
          </button>
          <button className={activeTab === 'sections' ? 'active' : ''} onClick={() => setActiveTab('sections')}>
            模块管理
          </button>
          <button className={activeTab === 'faq' ? 'active' : ''} onClick={() => setActiveTab('faq')}>
            FAQ 管理
          </button>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-header">
          <div>
            <p>Admin Workspace</p>
            <h1>正式网站内容管理</h1>
          </div>
          <button className="save-button" onClick={saveContent} disabled={saving}>
            {saving ? '保存中...' : '保存内容'}
          </button>
        </header>

        {activeTab === 'site' && (
          <section className="editor-card">
            <h2>首页设置</h2>
            <div className="form-grid">
              <label>
                标题
                <input
                  value={content.site.title}
                  onChange={(event) => updateSiteField('title', event.target.value)}
                />
              </label>
              <label className="span-2">
                副标题
                <textarea
                  rows="4"
                  value={content.site.subtitle}
                  onChange={(event) => updateSiteField('subtitle', event.target.value)}
                />
              </label>
              <label>
                主按钮
                <input
                  value={content.site.primaryAction}
                  onChange={(event) => updateSiteField('primaryAction', event.target.value)}
                />
              </label>
              <label>
                次按钮
                <input
                  value={content.site.secondaryAction}
                  onChange={(event) => updateSiteField('secondaryAction', event.target.value)}
                />
              </label>
            </div>
          </section>
        )}

        {activeTab === 'services' && (
          <section className="editor-card">
            <h2>服务管理</h2>
            <div className="stack-grid">
              {content.services.map((service, index) => (
                <article key={service.id} className="stack-item">
                  <strong>{service.title}</strong>
                  <div className="form-grid">
                    <label>
                      标题
                      <input
                        value={service.title}
                        onChange={(event) =>
                          updateCollectionItem('services', index, 'title', event.target.value)
                        }
                      />
                    </label>
                    <label>
                      价格
                      <input
                        value={service.price}
                        onChange={(event) =>
                          updateCollectionItem('services', index, 'price', event.target.value)
                        }
                      />
                    </label>
                    <label className="span-2">
                      简介
                      <textarea
                        rows="3"
                        value={service.summary}
                        onChange={(event) =>
                          updateCollectionItem('services', index, 'summary', event.target.value)
                        }
                      />
                    </label>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {activeTab === 'sections' && (
          <section className="editor-card">
            <h2>模块管理</h2>
            <div className="stack-grid">
              {content.sections.map((section, index) => (
                <article key={section.id} className="stack-item">
                  <strong>{section.title}</strong>
                  <div className="form-grid">
                    <label>
                      标题
                      <input
                        value={section.title}
                        onChange={(event) =>
                          updateCollectionItem('sections', index, 'title', event.target.value)
                        }
                      />
                    </label>
                    <label className="span-2">
                      正文
                      <textarea
                        rows="4"
                        value={section.body}
                        onChange={(event) =>
                          updateCollectionItem('sections', index, 'body', event.target.value)
                        }
                      />
                    </label>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {activeTab === 'faq' && (
          <section className="editor-card">
            <h2>FAQ 管理</h2>
            <div className="stack-grid">
              {content.faq.map((item, index) => (
                <article key={item.question} className="stack-item">
                  <div className="form-grid">
                    <label className="span-2">
                      问题
                      <input
                        value={item.question}
                        onChange={(event) =>
                          updateCollectionItem('faq', index, 'question', event.target.value)
                        }
                      />
                    </label>
                    <label className="span-2">
                      回答
                      <textarea
                        rows="4"
                        value={item.answer}
                        onChange={(event) =>
                          updateCollectionItem('faq', index, 'answer', event.target.value)
                        }
                      />
                    </label>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

export default App
