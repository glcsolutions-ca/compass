param location string
param sessionPoolName string
param environmentId string
param image string
param registryServer string
param registryIdentityResourceId string
param sessionExecutorPrincipalId string
param sessionExecutorRoleDefinitionId string
param runtimeEngine string = 'codex'
param codexAppServerCommand string = 'codex'
param codexAppServerArgs string = 'app-server'
param codexTurnTimeoutMs int = 120000
param codexApiKeySecretName string = 'openai-api-key'
@secure()
param codexApiKeySecretValue string = ''
param targetPort int = 8080
param readySessionInstances int = 0
param maxSessionPoolSize int = 20
param maxConcurrentSessions int = 20
param cooldownPeriodInSeconds int = 300
param sessionNetworkStatus string = 'EgressEnabled'
param cpu string = '0.25'
param memory string = '0.5Gi'
param tags object = {}

var runtimeEnvironmentVariables = concat(
  [
    {
      name: 'PORT'
      value: string(targetPort)
    }
    {
      name: 'HOST'
      value: '0.0.0.0'
    }
    {
      name: 'SESSION_RUNTIME_ENGINE'
      value: runtimeEngine
    }
    {
      name: 'CODEX_APP_SERVER_COMMAND'
      value: codexAppServerCommand
    }
    {
      name: 'CODEX_APP_SERVER_ARGS'
      value: codexAppServerArgs
    }
    {
      name: 'CODEX_RUNTIME_TURN_TIMEOUT_MS'
      value: string(codexTurnTimeoutMs)
    }
  ],
  empty(codexApiKeySecretValue)
    ? []
    : [
        {
          name: 'OPENAI_API_KEY'
          secretRef: codexApiKeySecretName
        }
      ]
)

var runtimeSecrets = empty(codexApiKeySecretValue)
  ? []
  : [
      {
        name: codexApiKeySecretName
        value: codexApiKeySecretValue
      }
    ]

resource sessionPool 'Microsoft.App/sessionPools@2025-07-01' = {
  name: sessionPoolName
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${registryIdentityResourceId}': {}
    }
  }
  tags: tags
  properties: {
    environmentId: environmentId
    poolManagementType: 'Dynamic'
    containerType: 'CustomContainer'
    secrets: runtimeSecrets
    scaleConfiguration: {
      maxConcurrentSessions: maxConcurrentSessions
      readySessionInstances: readySessionInstances
      maxSessionPoolSize: maxSessionPoolSize
    }
    dynamicPoolConfiguration: {
      lifecycleConfiguration: {
        lifecycleType: 'Timed'
        cooldownPeriodInSeconds: cooldownPeriodInSeconds
      }
    }
    customContainerTemplate: {
      registryCredentials: {
        server: registryServer
        identity: registryIdentityResourceId
      }
      containers: [
        {
          name: 'compass-codex-session-runtime'
          image: image
          resources: {
            cpu: json(cpu)
            memory: memory
          }
          env: runtimeEnvironmentVariables
        }
      ]
      ingress: {
        targetPort: targetPort
      }
    }
    sessionNetworkConfiguration: {
      status: sessionNetworkStatus
    }
  }
}

resource sessionExecutorRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(sessionPool.id, sessionExecutorPrincipalId, sessionExecutorRoleDefinitionId)
  scope: sessionPool
  properties: {
    principalId: sessionExecutorPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: sessionExecutorRoleDefinitionId
  }
}

output sessionPoolId string = sessionPool.id
output sessionPoolNameOutput string = sessionPool.name
output poolManagementEndpoint string = sessionPool.properties.poolManagementEndpoint
output sessionExecutorRoleAssignmentId string = sessionExecutorRoleAssignment.id
