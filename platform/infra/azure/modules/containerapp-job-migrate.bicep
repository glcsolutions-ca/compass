param location string
param jobName string
param managedEnvironmentId string
param image string
@secure()
param databaseUrl string
param migrationLockTimeout string = '5s'
param migrationStatementTimeout string = '15min'
param seedDefaultTenantId string
param seedDefaultAppClientId string
param seedDefaultUserOid string
param seedDefaultUserEmail string
param seedDefaultUserDisplayName string

resource migrateJob 'Microsoft.App/jobs@2024-03-01' = {
  name: jobName
  location: location
  properties: {
    environmentId: managedEnvironmentId
    configuration: {
      triggerType: 'Manual'
      replicaTimeout: 900
      replicaRetryLimit: 1
      manualTriggerConfig: {
        parallelism: 1
        replicaCompletionCount: 1
      }
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
            'sh'
            '-c'
            'node packages/database/scripts/migrate.mjs up && node packages/database/scripts/seed-postgres.mjs'
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
            {
              name: 'PGOPTIONS'
              value: '-c lock_timeout=${migrationLockTimeout} -c statement_timeout=${migrationStatementTimeout}'
            }
            {
              name: 'SEED_DEFAULT_TENANT_ID'
              value: seedDefaultTenantId
            }
            {
              name: 'SEED_DEFAULT_APP_CLIENT_ID'
              value: seedDefaultAppClientId
            }
            {
              name: 'SEED_DEFAULT_USER_OID'
              value: seedDefaultUserOid
            }
            {
              name: 'SEED_DEFAULT_USER_EMAIL'
              value: seedDefaultUserEmail
            }
            {
              name: 'SEED_DEFAULT_USER_DISPLAY_NAME'
              value: seedDefaultUserDisplayName
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
