import { z } from 'zod'
import * as strands from '@strands-agents/sdk'
import express from 'express'

const PORT = 8080

const timestampTool = strands.tool({
  name: 'get_timestamp',
  description: 'Get the current timestamp',
  callback: () => {
    const timestamp = new Date().toISOString()
    console.log(`[TOOL] get_timestamp called: ${timestamp}`)
    return `Current timestamp: ${timestamp}`
  },
})

const agent = new strands.Agent({
  model: new strands.BedrockModel({
    region: process.env.AWS_REGION || 'us-east-1',
  }),
  tools: [timestampTool],
})

const app = express()

app.get('/ping', (_, res) => {
  console.log('[HEALTH] Ping received')
  res.json({
    status: 'Healthy',
    time_of_last_update: Math.floor(Date.now() / 1000),
  })
})

app.post('/invocations', express.raw({ type: '*/*' }), async (req, res) => {
  try {
    const prompt = new TextDecoder().decode(req.body)
    console.log('[INFO] Invocation received')
    console.log('[INFO] Prompt:', prompt)
    console.log('[INFO] Invoking agent...')
    
    const response = await agent.invoke(prompt)
    
    console.log('[INFO] Agent response generated')
    console.log('[INFO] Response type:', typeof response)
    console.log('[INFO] Response:', JSON.stringify(response))
    
    return res.json({ response })
  } catch (err: any) {
    console.error('[ERROR] Error processing request')
    console.error('[ERROR] Error message:', err.message)
    console.error('[ERROR] Error stack:', err.stack)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

app.listen(PORT, () => {
  console.log(`[INFO] AgentCore Runtime server listening on 0.0.0.0:${PORT}`)
  console.log(`[INFO] Endpoints:`)
  console.log(`[INFO]   POST http://0.0.0.0:${PORT}/invocations`)
  console.log(`[INFO]   GET  http://0.0.0.0:${PORT}/ping`)
})
