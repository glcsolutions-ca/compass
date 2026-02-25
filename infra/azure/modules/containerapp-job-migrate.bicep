param location string
param jobName string
param managedEnvironmentId string
param image string
param registryServer string
param registryIdentityResourceId string
@secure()
param databaseUrl string
param migrationLockTimeout string = '5s'
param migrationStatementTimeout string = '15min'
param authBootstrapAllowedTenantId string
param authBootstrapAllowedAppClientId string
param authBootstrapDelegatedUserOid string
param authBootstrapDelegatedUserEmail string

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
      replicaTimeout: 900
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
            'sh'
            '-c'
            'node db/scripts/migrate.mjs up && node db/scripts/seed-postgres.mjs'
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
              name: 'AUTH_BOOTSTRAP_ALLOWED_TENANT_ID'
              value: authBootstrapAllowedTenantId
            }
            {
              name: 'AUTH_BOOTSTRAP_ALLOWED_APP_CLIENT_ID'
              value: authBootstrapAllowedAppClientId
            }
            {
              name: 'AUTH_BOOTSTRAP_DELEGATED_USER_OID'
              value: authBootstrapDelegatedUserOid
            }
            {
              name: 'AUTH_BOOTSTRAP_DELEGATED_USER_EMAIL'
              value: authBootstrapDelegatedUserEmail
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
