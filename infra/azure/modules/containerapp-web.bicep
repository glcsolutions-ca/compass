param location string
param containerAppName string
param managedEnvironmentId string
param image string
param registryServer string
param registryIdentityResourceId string
param keyVaultUri string
param apiBaseUrl string
param webBaseUrl string
@allowed([
  'mock'
  'entra'
])
param authMode string = 'entra'
param entraClientId string = ''
param entraAllowedTenantIds string = ''
param customDomainName string = ''

var normalizedKeyVaultUri = endsWith(keyVaultUri, '/') ? keyVaultUri : '${keyVaultUri}/'
var keyVaultSecretBaseUrl = '${normalizedKeyVaultUri}secrets'
var includeEntraClientSecret = toLower(authMode) == 'entra'
var entraClientSecretRef = includeEntraClientSecret
  ? [
      {
        name: 'ENTRA_CLIENT_SECRET'
        secretRef: 'entra-client-secret'
      }
    ]
  : []

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
        targetPort: 3000
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
      secrets: concat(
        [
          {
            name: 'web-session-secret'
            keyVaultUrl: '${keyVaultSecretBaseUrl}/web-session-secret'
            identity: registryIdentityResourceId
          }
        ],
        includeEntraClientSecret
          ? [
              {
                name: 'entra-client-secret'
                keyVaultUrl: '${keyVaultSecretBaseUrl}/entra-client-secret'
                identity: registryIdentityResourceId
              }
            ]
          : []
      )
    }
    template: {
      containers: [
        {
          name: 'compass-web'
          image: image
          env: concat(
            [
              {
                name: 'API_BASE_URL'
                value: apiBaseUrl
              }
              {
                name: 'WEB_SESSION_SECRET'
                secretRef: 'web-session-secret'
              }
              {
                name: 'ENTRA_CLIENT_ID'
                value: entraClientId
              }
              {
                name: 'WEB_BASE_URL'
                value: webBaseUrl
              }
              {
                name: 'ENTRA_ALLOWED_TENANT_IDS'
                value: entraAllowedTenantIds
              }
              {
                name: 'VITE_API_BASE_URL'
                value: apiBaseUrl
              }
            ],
            entraClientSecretRef
          )
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          probes: [
            {
              type: 'Startup'
              httpGet: {
                path: '/'
                port: 3000
              }
              initialDelaySeconds: 5
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/'
                port: 3000
              }
              initialDelaySeconds: 5
            }
            {
              type: 'Liveness'
              httpGet: {
                path: '/'
                port: 3000
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
