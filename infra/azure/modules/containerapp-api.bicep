param location string
param containerAppName string
param managedEnvironmentId string
param image string
param keyVaultId string
param keyVaultUri string
@secure()
param databaseUrl string
param webBaseUrl string
param authMode string = 'entra'
param entraClientId string = ''
param entraAllowedTenantIds string = ''
param minReplicas int = 1
param maxReplicas int = 1
param customDomainNames array = []
param logLevel string = 'warn'

var normalizedKeyVaultUri = endsWith(keyVaultUri, '/') ? keyVaultUri : '${keyVaultUri}/'
var keyVaultSecretBaseUrl = '${normalizedKeyVaultUri}secrets'
var includeEntraSecrets = toLower(authMode) == 'entra'
var customDomains = [for domainName in customDomainNames: {
  name: domainName
  bindingType: 'Disabled'
}]

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: last(split(keyVaultId, '/'))
}

resource containerApp 'Microsoft.App/containerApps@2025-07-01' = {
  name: containerAppName
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    managedEnvironmentId: managedEnvironmentId
    configuration: {
      activeRevisionsMode: 'single'
      ingress: {
        external: true
        targetPort: 3001
        allowInsecure: false
        transport: 'auto'
        customDomains: customDomains
      }
      secrets: concat(
        [
          {
            name: 'database-url'
            value: databaseUrl
          }
        ],
        includeEntraSecrets
          ? [
              {
                name: 'entra-client-secret'
                keyVaultUrl: '${keyVaultSecretBaseUrl}/entra-client-secret'
                identity: 'system'
              }
              {
                name: 'auth-oidc-state-encryption-key'
                keyVaultUrl: '${keyVaultSecretBaseUrl}/auth-oidc-state-encryption-key'
                identity: 'system'
              }
            ]
          : []
      )
    }
    template: {
      containers: [
        {
          name: 'api'
          image: image
          env: concat(
            [
              {
                name: 'API_HOST'
                value: '0.0.0.0'
              }
              {
                name: 'API_PORT'
                value: '3001'
              }
              {
                name: 'DATABASE_URL'
                secretRef: 'database-url'
              }
              {
                name: 'DB_SSL_MODE'
                value: 'require'
              }
              {
                name: 'DB_SSL_REJECT_UNAUTHORIZED'
                value: 'true'
              }
              {
                name: 'LOG_LEVEL'
                value: logLevel
              }
              {
                name: 'AUTH_MODE'
                value: authMode
              }
              {
                name: 'WEB_BASE_URL'
                value: webBaseUrl
              }
              {
                name: 'ENTRA_CLIENT_ID'
                value: entraClientId
              }
              {
                name: 'ENTRA_ALLOWED_TENANT_IDS'
                value: entraAllowedTenantIds
              }
              {
                name: 'AGENT_GATEWAY_ENABLED'
                value: 'false'
              }
            ],
            includeEntraSecrets
              ? [
                  {
                    name: 'ENTRA_CLIENT_SECRET'
                    secretRef: 'entra-client-secret'
                  }
                  {
                    name: 'AUTH_OIDC_STATE_ENCRYPTION_KEY'
                    secretRef: 'auth-oidc-state-encryption-key'
                  }
                ]
              : []
          )
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          probes: [
            {
              type: 'Startup'
              httpGet: {
                path: '/health'
                port: 3001
              }
              initialDelaySeconds: 5
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/health'
                port: 3001
              }
              initialDelaySeconds: 5
            }
            {
              type: 'Liveness'
              httpGet: {
                path: '/health'
                port: 3001
              }
              initialDelaySeconds: 30
            }
          ]
        }
      ]
      scale: {
        minReplicas: minReplicas
        maxReplicas: maxReplicas
      }
    }
  }
}

resource keyVaultSecretsUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (includeEntraSecrets) {
  name: guid(keyVault.id, containerApp.name, 'key-vault-secrets-user')
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')
    principalId: containerApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

output appName string = containerApp.name
output ingressFqdn string = containerApp.properties.configuration.ingress.fqdn
output latestRevisionName string = containerApp.properties.latestRevisionName
