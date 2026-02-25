param location string
param containerAppName string
param managedEnvironmentId string
param image string
param registryServer string
param registryIdentityResourceId string
param apiBaseUrl string
param webBaseUrl string
@secure()
param webSessionSecret string
param entraLoginEnabled string = 'false'
param entraClientId string = ''
@secure()
param entraClientSecret string = ''
param entraAllowedTenantIds string = ''
param authDevFallbackEnabled string = 'false'
param customDomainName string = ''

var hasEntraClientSecret = !empty(entraClientSecret)
var entraClientSecretEnv = hasEntraClientSecret
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
            value: webSessionSecret
          }
        ],
        hasEntraClientSecret
          ? [
              {
                name: 'entra-client-secret'
                value: entraClientSecret
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
                name: 'ENTRA_LOGIN_ENABLED'
                value: entraLoginEnabled
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
                name: 'AUTH_DEV_FALLBACK_ENABLED'
                value: authDevFallbackEnabled
              }
              {
                name: 'VITE_API_BASE_URL'
                value: apiBaseUrl
              }
            ],
            entraClientSecretEnv
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
