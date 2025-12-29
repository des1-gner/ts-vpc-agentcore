# Bedrock AgentCore with TypeScript - VPC Deployment

Simple guide to deploy a TypeScript agent to Amazon Bedrock AgentCore Runtime with VPC connectivity and CloudWatch logging.

## Prerequisites

- Node.js 18+
- AWS account with appropriate permissions
- AWS CLI configured with credentials
- Python 3.10+ (for agentcore CLI)
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

### Create Additional VPC Endpoints

Go to **VPC Console** → **Endpoints** → **Create endpoint**

Create these 3 endpoints:

**1. ECR Docker Endpoint**
- **Service name**: `com.amazonaws.ap-southeast-1.ecr.dkr`
- **VPC**: Select `project-vpc`
- **Subnets**: Select all 3 private subnets
- **Security group**: Create new `vpc-endpoints-sg` with inbound HTTPS (443) from 10.0.0.0/16

**2. ECR API Endpoint**
- **Service name**: `com.amazonaws.ap-southeast-1.ecr.api`
- **VPC**: Select `project-vpc`
- **Subnets**: Select all 3 private subnets
- **Security group**: Use `vpc-endpoints-sg`

**3. CloudWatch Logs Endpoint**
- **Service name**: `com.amazonaws.ap-southeast-1.logs`
- **VPC**: Select `project-vpc`
- **Subnets**: Select all 3 private subnets
- **Security group**: Use `vpc-endpoints-sg`

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

### Install CLI

```bash
pip install bedrock-agentcore
pip install bedrock-agentcore-starter-toolkit
```

### Create Project

```bash
mkdir agentcore-simple
cd agentcore-simple
npm init -y
```

### Install Dependencies

```bash
npm install @strands-agents/sdk zod
npm install --save-dev typescript @types/node
```

### Create Agent Code

Create `index.ts`:

```typescript
import { Agent, BedrockModel, tool } from '@strands-agents/sdk'
import { z } from 'zod'

const timestampTool = tool({
  name: 'get_timestamp',
  description: 'Get the current timestamp',
  inputSchema: z.object({}),
  callback: () => {
    const timestamp = new Date().toISOString()
    console.log(`[TOOL] get_timestamp called: ${timestamp}`)
    return `Current timestamp: ${timestamp}`
  },
})

const model = new BedrockModel({
  region: 'ap-southeast-1',
})

const agent = new Agent({
  systemPrompt: 'You are a helpful assistant that can provide the current timestamp.',
  model,
  tools: [timestampTool],
})

async function handler(event: any) {
  try {
    console.log('[INFO] Agent invoked with event:', JSON.stringify(event))
    
    const prompt = event.prompt || event.input || 'Hello!'
    console.log('[INFO] User prompt:', prompt)
    
    const result = await agent.invoke(prompt)
    
    console.log('[INFO] Agent response:', result)
    
    return {
      message: result,
      timestamp: new Date().toISOString(),
      status: 'success'
    }
  } catch (error: any) {
    console.error('[ERROR] Error in agent:', error)
    return {
      error: error.message,
      status: 'error'
    }
  }
}

export { handler }
```

### Create TypeScript Config

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "moduleResolution": "node"
  },
  "include": ["index.ts"],
  "exclude": ["node_modules"]
}
```

### Update package.json

Edit `package.json`:

```json
{
  "name": "agentcore-simple-agent",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@strands-agents/sdk": "latest",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^20.0.0"
  }
}
```

### Create requirements.txt

Create `requirements.txt`:

```
bedrock-agentcore>=0.1.0
```

### Build

```bash
npm run build
```

---

## Part 3: Deploy

### Configure

```bash
agentcore configure -e index.ts
```

During configuration:
- **Execution Role**: Press Enter to auto-create
- **ECR Repository**: Press Enter to auto-create
- **Dependency file**: Select `package.json`
- **Authorization**: `no`
- **Region**: `ap-southeast-1`

### Launch

```bash
agentcore launch
```

Save the Agent ARN from output.

### Enable VPC in Console

1. Go to **Bedrock AgentCore Console**
2. Select your runtime
3. Click **Edit** → **Network configuration**
4. Select **VPC**
5. Choose:
   - **VPC**: `project-vpc`
   - **Subnets**: All 3 private subnets
   - **Security group**: `agentcore-runtime-sg`
6. Click **Save**

---

## Part 4: Test and Verify

### Test with CLI

```bash
agentcore invoke '{"prompt": "What is the current timestamp?"}'
```

Expected output:

```json
{
  "message": "Current timestamp: 2025-12-30T10:15:23.456Z",
  "timestamp": "2025-12-30T10:15:23.456Z",
  "status": "success"
}
```

### Check CloudWatch Logs

1. Go to **CloudWatch Console** → **Log groups**
2. Find `/aws/bedrock-agentcore/runtimes/{your-agent-id}-DEFAULT`
3. Click log stream to see:

```
[INFO] Agent invoked with event: {"prompt":"What is the current timestamp?"}
[INFO] User prompt: What is the current timestamp?
[TOOL] get_timestamp called: 2025-12-30T10:15:23.456Z
[INFO] Agent response: Current timestamp: 2025-12-30T10:15:23.456Z
```
