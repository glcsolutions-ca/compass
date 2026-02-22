param location string
param containerAppName string
param managedEnvironmentId string
param image string
param registryServer string
param registryIdentityResourceId string
param apiBaseUrl string
@secure()
param bearerToken string = ''

resource containerApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: containerAppName
  location: location
  identity: {
    type: 'SystemAssigned,UserAssigned'
    userAssignedIdentities: {
      '${registryIdentityResourceId}': {}
    }
  }
  properties: {
    managedEnvironmentId: managedEnvironmentId
    configuration: {
      activeRevisionsMode: 'multiple'
      ingress: {
        external: true
        targetPort: 3000
        allowInsecure: false
        transport: 'auto'
      }
      registries: [
        {
          server: registryServer
          identity: registryIdentityResourceId
        }
      ]
      secrets: [
        {
          name: 'web-bearer-token'
          value: bearerToken
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
            {
              name: 'NEXT_PUBLIC_API_BASE_URL'
              value: apiBaseUrl
            }
            {
              name: 'BEARER_TOKEN'
              secretRef: 'web-bearer-token'
            }
            {
              name: 'NEXT_PUBLIC_BEARER_TOKEN'
              secretRef: 'web-bearer-token'
            }
          ]
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 3
      }
    }
  }
}

output appName string = containerApp.name
output latestRevisionName string = containerApp.properties.latestRevisionName
output latestRevisionFqdn string = containerApp.properties.latestRevisionFqdn
output principalId string = containerApp.identity.principalId
