import { createApp } from './app.js'

const port = Number(process.env.PORT ?? 8787)
const app = createApp()

app.listen(port, () => {
  console.log(`API listening on http://127.0.0.1:${port}`)
})
