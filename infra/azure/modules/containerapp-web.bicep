param location string
param containerAppName string
param managedEnvironmentId string
param image string
param registryServer string
param registryIdentityResourceId string
param apiBaseUrl string
param customDomainName string = ''
param customDomainCertificateId string = ''

resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
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
        customDomains: empty(customDomainName) || empty(customDomainCertificateId)
          ? []
          : [
              {
                name: customDomainName
                bindingType: 'SniEnabled'
                certificateId: customDomainCertificateId
              }
            ]
      }
      registries: [
        {
          server: registryServer
          identity: registryIdentityResourceId
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'compass-web'
          image: image
          env: [
            {
              name: 'API_BASE_URL'
              value: apiBaseUrl
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
        minReplicas: 0
        maxReplicas: 1
      }
    }
  }
}

output appName string = containerApp.name
output latestRevisionName string = containerApp.properties.latestRevisionName
output latestRevisionFqdn string = containerApp.properties.latestRevisionFqdn
