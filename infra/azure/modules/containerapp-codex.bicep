param location string
param containerAppName string
param managedEnvironmentId string
param image string
param registryServer string
param registryIdentityResourceId string
@secure()
param databaseUrl string
param logLevel string = 'warn'
param customDomainName string = ''

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
        targetPort: 3010
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
      secrets: [
        {
          name: 'database-url'
          value: databaseUrl
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'compass-codex-app-server'
          image: image
          env: [
            {
              name: 'CODEX_HOST'
              value: '0.0.0.0'
            }
            {
              name: 'CODEX_PORT'
              value: '3010'
            }
            {
              name: 'DATABASE_URL'
              secretRef: 'database-url'
            }
            {
              name: 'CODEX_HOME'
              value: '/var/lib/codex-home'
            }
            {
              name: 'CODEX_START_ON_BOOT'
              value: 'true'
            }
            {
              name: 'LOG_LEVEL'
              value: logLevel
            }
          ]
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          probes: [
            {
              type: 'Startup'
              httpGet: {
                path: '/health'
                port: 3010
              }
              initialDelaySeconds: 5
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/health'
                port: 3010
              }
              initialDelaySeconds: 5
            }
            {
              type: 'Liveness'
              httpGet: {
                path: '/health'
                port: 3010
              }
              initialDelaySeconds: 30
            }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 1
      }
    }
  }
}

output appName string = containerApp.name
output latestRevisionName string = containerApp.properties.latestRevisionName
output latestRevisionFqdn string = containerApp.properties.latestRevisionFqdn
