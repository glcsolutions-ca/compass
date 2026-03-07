param location string
param containerAppName string
param managedEnvironmentId string
param image string
param apiBaseUrl string
param minReplicas int = 1
param maxReplicas int = 1
param customDomainNames array = []

var customDomains = [for domainName in customDomainNames: {
  name: domainName
  bindingType: 'Disabled'
}]

resource containerApp 'Microsoft.App/containerApps@2025-07-01' = {
  name: containerAppName
  location: location
  properties: {
    managedEnvironmentId: managedEnvironmentId
    configuration: {
      activeRevisionsMode: 'single'
      ingress: {
        external: true
        targetPort: 3000
        allowInsecure: false
        transport: 'auto'
        customDomains: customDomains
      }
    }
    template: {
      containers: [
        {
          name: 'web'
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
        minReplicas: minReplicas
        maxReplicas: maxReplicas
      }
    }
  }
}

output appName string = containerApp.name
output ingressFqdn string = containerApp.properties.configuration.ingress.fqdn
output latestRevisionName string = containerApp.properties.latestRevisionName
