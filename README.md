# Bedrock AgentCore with TypeScript - VPC Deployment

Simple guide to deploy a TypeScript agent to Amazon Bedrock AgentCore Runtime with VPC connectivity and CloudWatch logging.

## Prerequisites

- Node.js 18+
- AWS account with appropriate permissions
- AWS CLI configured with credentials
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

### Install CLI and Create Project

```bash
npm install -g bedrock-agentcore

mkdir agentcore-simple
cd agentcore-simple
mkdir agent
cd agent

npm init -y
npm install bedrock-agentcore
npm install --save-dev typescript @types/node
```

### Create Agent Code

Create `agent/agent.ts`:

```typescript
import { BedrockAgentCoreApp } from 'bedrock-agentcore';

const app = new BedrockAgentCoreApp();

app.entrypoint(async (payload: any, context: any) => {
  try {
    console.log('[INFO] Agent invoked with payload:', JSON.stringify(payload));
    
    const userInput = payload.prompt || payload.input || 'Hello!';
    console.log('[INFO] User input:', userInput);
    
    const response = {
      message: `Received: ${userInput}`,
      timestamp: new Date().toISOString(),
      status: 'success'
    };
    
    console.log('[INFO] Returning response:', JSON.stringify(response));
    
    return response;
  } catch (error: any) {
    console.error('[ERROR] Error in agent:', error);
    return {
      error: error.message,
      status: 'error'
    };
  }
});

if (require.main === module) {
  app.run();
}
```

### Create TypeScript Config

Create `agent/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["agent.ts"],
  "exclude": ["node_modules"]
}
```

### Update package.json

Edit `agent/package.json`:

```json
{
  "name": "agentcore-simple-agent",
  "version": "1.0.0",
  "main": "dist/agent.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/agent.js"
  },
  "dependencies": {
    "bedrock-agentcore": "^0.1.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^20.0.0"
  }
}
```

### Build

```bash
npm run build
```

---

## Part 3: Deploy

### Configure and Deploy

```bash
agentcore configure -e agent.ts
```

Press Enter for defaults, select:
- Authorization: `no`
- Region: `ap-southeast-1`

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
agentcore invoke '{"prompt": "Hello from VPC!"}'
```

Expected output:

```json
{
  "message": "Received: Hello from VPC!",
  "timestamp": "2025-12-30T10:15:23.456Z",
  "status": "success"
}
```

### Check CloudWatch Logs

1. Go to **CloudWatch Console** → **Log groups**
2. Find `/aws/bedrock-agentcore/runtimes/{your-agent-id}-DEFAULT`
3. Click log stream to see:

```
[INFO] Agent invoked with payload: {"prompt":"Hello from VPC!"}
[INFO] User input: Hello from VPC!
[INFO] Returning response: {"message":"Received: Hello from VPC!","timestamp":"...","status":"success"}
```
