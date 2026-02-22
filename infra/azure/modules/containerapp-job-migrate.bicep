param location string
param jobName string
param managedEnvironmentId string
param image string
param registryServer string
param registryIdentityResourceId string
@secure()
param databaseUrl string

resource migrateJob 'Microsoft.App/jobs@2024-03-01' = {
  name: jobName
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${registryIdentityResourceId}': {}
    }
  }
  properties: {
    environmentId: managedEnvironmentId
    configuration: {
      triggerType: 'Manual'
      replicaTimeout: 1800
      replicaRetryLimit: 1
      manualTriggerConfig: {
        parallelism: 1
        replicaCompletionCount: 1
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
          name: 'migrate'
          image: image
          command: [
            'node'
            'scripts/db/migrate.mjs'
            'up'
          ]
          env: [
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
          ]
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
        }
      ]
    }
  }
}

output jobNameOutput string = migrateJob.name
output jobId string = migrateJob.id
