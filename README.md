# Bedrock AgentCore with TypeScript - VPC Deployment

Simple guide to deploy a TypeScript agent to Amazon Bedrock AgentCore Runtime with VPC connectivity and CloudWatch logging.

## Prerequisites

- Node.js 20+
- AWS account with appropriate permissions
- AWS CLI configured with credentials
- Docker installed
- Model access: Anthropic Claude Sonnet 4.5 enabled in Bedrock console (ap-southeast-1)

---

## Part 1: VPC Setup

### Create VPC using AWS Console

1. Go to **VPC Console** → **Create VPC**
2. Select **VPC and more**
3. Configure:
   - **Name**: `project`
   - **IPv4 CIDR**: `10.0.0.0/16`
   - **Number of AZs**: `3`
   - **Number of public subnets**: `3`
   - **Number of private subnets**: `3`
   - **NAT gateways**: `1 per AZ`
   - **VPC endpoints**: Select `S3 Gateway`
   - **DNS options**: Enable both DNS hostnames and DNS resolution
4. Click **Create VPC**

### Additional VPC Endpoints (Optional)

Depending on your setup, you may need these VPC endpoints. If you create them, be sure to configure them with your security group and private subnets:

**ECR Docker Endpoint**
- **Service name**: `com.amazonaws.ap-southeast-1.ecr.dkr`

**ECR API Endpoint**
- **Service name**: `com.amazonaws.ap-southeast-1.ecr.api`

**CloudWatch Logs Endpoint**
- **Service name**: `com.amazonaws.ap-southeast-1.logs`

### Create Security Group for AgentCore

**EC2 Console** → **Security Groups** → **Create security group**

- **Name**: `agentcore-runtime-sg`
- **VPC**: Select `project-vpc`
- **Outbound rules**:
  - HTTPS (443) to 0.0.0.0/0
  - HTTP (80) to 0.0.0.0/0
- **Inbound rules**: None

**Save these for later:**
- VPC ID: `vpc-xxxxxxxxx`
- Private Subnet IDs: `subnet-xxx1`, `subnet-xxx2`, `subnet-xxx3`
- Security Group ID: `sg-xxxxxxxxx`

---

## Part 2: Create Agent

### Create Project

```bash
mkdir agentcore-simple
cd agentcore-simple
```

### Create package.json

Create `package.json`:

```json
{
  "name": "agentcore-simple",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@strands-agents/sdk": "latest",
    "express": "^4.18.2",
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^20.0.0",
    "typescript": "^5.3.3"
  }
}
```

### Install Dependencies

```bash
rm -rf node_modules package-lock.json
npm install
```

### Create TypeScript Config

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "./dist",
    "rootDir": "./",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

### Create Agent Code

Create `index.ts`:

```typescript
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
    region: 'ap-southeast-1',
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
```

### Build

```bash
npm run build
```

---

## Part 3: Deploy

### Create Dockerfile

Create `Dockerfile`:

```dockerfile
FROM --platform=linux/arm64 public.ecr.aws/docker/library/node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY dist ./dist

EXPOSE 8080

CMD ["node", "dist/index.js"]
```

### Set Environment Variables

```bash
export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export AWS_REGION=ap-southeast-1
export ECR_REPO=agentcore-simple
```

### Create ECR Repository

```bash
aws ecr create-repository \
  --repository-name ${ECR_REPO} \
  --region ${AWS_REGION}
```

### Build and Push to ECR

```bash
aws ecr get-login-password --region ${AWS_REGION} | \
  docker login --username AWS --password-stdin \
  ${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com

docker build --platform linux/arm64 -t ${ECR_REPO} .

docker tag ${ECR_REPO}:latest \
  ${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO}:latest

docker push ${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO}:latest
```

### Deploy to Bedrock AgentCore via Console

1. Go to **Bedrock Console** → **AgentCore** → **Runtimes** → **Create runtime**
2. Configure:
   - **Name**: `agentcore-simple`
   - **Image URI**: `${ACCOUNT_ID}.dkr.ecr.ap-southeast-1.amazonaws.com/agentcore-simple:latest`
   - **Execution role**: Select "Create and use a new service role"
3. Click **Create**

### Enable VPC in Console

1. Select your runtime
2. Click **Edit** → **Network configuration**
3. Select **VPC**
4. Choose:
   - **VPC**: `project-vpc`
   - **Subnets**: All 3 private subnets
   - **Security group**: `agentcore-runtime-sg`
5. Click **Save**

---

## Part 4: Test and Verify

### Test in Console

1. Go to **Bedrock Console** → **AgentCore** → **Runtimes**
2. Select your runtime
3. Click **Test** tab
4. Enter prompt: `{"prompt": "What is the current timestamp?"}`
5. Click **Run**

### Check CloudWatch Logs

1. Go to **CloudWatch Console** → **Log groups**
2. Find `/aws/bedrock-agentcore/runtimes/{your-agent-id}-DEFAULT`
3. Click log stream to see:

```
[INFO] AgentCore Runtime server listening on 0.0.0.0:8080
[INFO] Endpoints:
[INFO]   POST http://0.0.0.0:8080/invocations
[INFO]   GET  http://0.0.0.0:8080/ping
[HEALTH] Ping received
[INFO] Invocation received
[INFO] Prompt: What is the current timestamp?
[INFO] Invoking agent...
[TOOL] get_timestamp called: 2025-12-30T10:15:23.456Z
[INFO] Agent response generated
[INFO] Response type: string
[INFO] Response: "Current timestamp: 2025-12-30T10:15:23.456Z"
```

---

## Resources

- [Strands Agents - Deploy to Bedrock AgentCore (TypeScript)](https://strandsagents.com/latest/documentation/docs/user-guide/deploy/deploy_to_bedrock_agentcore/typescript/)
- [AWS Bedrock AgentCore VPC Configuration](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/agentcore-vpc.html)
- [AWS Bedrock AgentCore Samples - TypeScript MCP Server](https://github.com/awslabs/amazon-bedrock-agentcore-samples/tree/f8a09c72d99c1365a981eae0ef2738f7e7ba2ac0/01-tutorials/01-AgentCore-runtime/04-hosting-ts-MCP-server)
- [AWS Bedrock AgentCore TypeScript SDK](https://github.com/aws/bedrock-agentcore-sdk-typescript)
- [AWS Bedrock AgentCore Troubleshooting - Missing CloudWatch Logs](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-troubleshooting.html#missing-cloudwatch-logs)
