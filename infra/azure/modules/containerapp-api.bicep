param location string
param containerAppName string
param managedEnvironmentId string
param image string
param registryServer string = 'ghcr.io'
param registryUsername string
@secure()
param registryPassword string
@secure()
param databaseUrl string
param authMode string = 'entra'
param requiredScope string = 'time.read'
param entraIssuer string
param entraAudience string
param entraJwksUri string

resource containerApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: containerAppName
  location: location
  properties: {
    managedEnvironmentId: managedEnvironmentId
    configuration: {
      activeRevisionsMode: 'multiple'
      ingress: {
        external: true
        targetPort: 3001
        allowInsecure: false
        transport: 'auto'
      }
      registries: [
        {
          server: registryServer
          username: registryUsername
          passwordSecretRef: 'ghcr-password'
        }
      ]
      secrets: [
        {
          name: 'ghcr-password'
          value: registryPassword
        }
        {
          name: 'database-url'
          value: databaseUrl
        }
      ]
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
              name: 'AUTH_MODE'
              value: authMode
            }
            {
              name: 'REQUIRED_SCOPE'
              value: requiredScope
            }
            {
              name: 'ENTRA_ISSUER'
              value: entraIssuer
            }
            {
              name: 'ENTRA_AUDIENCE'
              value: entraAudience
            }
            {
              name: 'ENTRA_JWKS_URI'
              value: entraJwksUri
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
