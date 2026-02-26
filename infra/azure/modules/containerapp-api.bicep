param location string
param containerAppName string
param managedEnvironmentId string
param image string
param registryServer string
param registryIdentityResourceId string
param keyVaultUri string
param webBaseUrl string
@allowed([
  'mock'
  'entra'
])
param authMode string = 'entra'
param entraClientId string = ''
param entraAllowedTenantIds string = ''
@secure()
param databaseUrl string
param authIssuer string
param authJwksUri string
param authAudience string
param authAllowedClientIds string
param authActiveTenantIds string
param oauthTokenIssuer string
param oauthTokenAudience string
param logLevel string = 'warn'
param customDomainName string = ''

var normalizedKeyVaultUri = endsWith(keyVaultUri, '/') ? keyVaultUri : '${keyVaultUri}/'
var keyVaultSecretBaseUrl = '${normalizedKeyVaultUri}secrets'

resource containerApp 'Microsoft.App/containerApps@2025-07-01' = {
  name: containerAppName
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${registryIdentityResourceId}': {}
    }
  }
  properties: {
    managedEnvironmentId: managedEnvironmentId
    configuration: {
      activeRevisionsMode: 'single'
      maxInactiveRevisions: 2
      ingress: {
        external: true
        targetPort: 3001
        allowInsecure: false
        transport: 'auto'
        customDomains: empty(customDomainName)
          ? []
          : [
              {
                name: customDomainName
                bindingType: 'Auto'
              }
            ]
      }
      registries: [
        {
          server: registryServer
          identity: registryIdentityResourceId
        }
      ]
      secrets: concat([
        {
          name: 'database-url'
          value: databaseUrl
        }
        {
          name: 'oauth-token-signing-secret'
          keyVaultUrl: '${keyVaultSecretBaseUrl}/oauth-token-signing-secret'
          identity: registryIdentityResourceId
        }
        {
          name: 'entra-client-secret'
          keyVaultUrl: '${keyVaultSecretBaseUrl}/entra-client-secret'
          identity: registryIdentityResourceId
        }
        {
          name: 'auth-oidc-state-encryption-key'
          keyVaultUrl: '${keyVaultSecretBaseUrl}/auth-oidc-state-encryption-key'
          identity: registryIdentityResourceId
        }
      ])
    }
    template: {
      containers: [
        {
          name: 'compass-api'
          image: image
          env: [
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
              name: 'WEB_BASE_URL'
              value: webBaseUrl
            }
            {
              name: 'AUTH_MODE'
              value: authMode
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
              name: 'ENTRA_CLIENT_SECRET'
              secretRef: 'entra-client-secret'
            }
            {
              name: 'AUTH_OIDC_STATE_ENCRYPTION_KEY'
              secretRef: 'auth-oidc-state-encryption-key'
            }
            {
              name: 'AUTH_ISSUER'
              value: authIssuer
            }
            {
              name: 'AUTH_JWKS_URI'
              value: authJwksUri
            }
            {
              name: 'AUTH_AUDIENCE'
              value: authAudience
            }
            {
              name: 'AUTH_ALLOWED_CLIENT_IDS'
              value: authAllowedClientIds
            }
            {
              name: 'AUTH_ACTIVE_TENANT_IDS'
              value: authActiveTenantIds
            }
            {
              name: 'OAUTH_TOKEN_ISSUER'
              value: oauthTokenIssuer
            }
            {
              name: 'OAUTH_TOKEN_AUDIENCE'
              value: oauthTokenAudience
            }
            {
              name: 'OAUTH_TOKEN_SIGNING_SECRET'
              secretRef: 'oauth-token-signing-secret'
            }
          ]
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
        // Keep a warm instance in production to avoid cold starts.
        minReplicas: 1
        maxReplicas: 1
      }
    }
  }
}

output appName string = containerApp.name
output latestRevisionName string = containerApp.properties.latestRevisionName
output latestRevisionFqdn string = containerApp.properties.latestRevisionFqdn
