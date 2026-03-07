param location string
param environmentName string
param keyVaultName string
param postgresServerName string
param postgresDatabaseName string = 'compass'
param postgresAdminUsername string
@secure()
param postgresAdminPassword string
param apiProdAppName string
param webProdAppName string
param apiStageAppName string
param webStageAppName string
param migrationJobName string
param apiProdImage string
param webProdImage string
param apiStageImage string
param webStageImage string
param migrationsImage string
param authMode string = 'entra'
param entraClientId string = ''
param entraAllowedTenantIds string = ''
param publicWebBaseUrl string
param dynamicSessionsPoolManagementEndpoint string = ''
param apiLogLevel string = 'warn'
param migrationLockTimeout string = '5s'
param migrationStatementTimeout string = '15min'
param seedDefaultTenantId string
param seedDefaultAppClientId string
param seedDefaultUserOid string
param seedDefaultUserEmail string
param seedDefaultUserDisplayName string

resource managedEnvironment 'Microsoft.App/managedEnvironments@2025-07-01' existing = {
  name: environmentName
}

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
}

resource postgresServer 'Microsoft.DBforPostgreSQL/flexibleServers@2023-12-01-preview' existing = {
  name: postgresServerName
}

var databaseUrl = 'postgresql://${postgresAdminUsername}:${uriComponent(postgresAdminPassword)}@${postgresServer.properties.fullyQualifiedDomainName}:5432/${postgresDatabaseName}?sslmode=require'
var stageApiBaseUrl = 'https://${apiStageAppName}.${managedEnvironment.properties.defaultDomain}'
var prodApiBaseUrl = 'https://${apiProdAppName}.${managedEnvironment.properties.defaultDomain}'
var stageWebBaseUrl = 'https://${webStageAppName}.${managedEnvironment.properties.defaultDomain}'

module apiProd 'modules/containerapp-api.bicep' = {
  name: 'api-prod'
  params: {
    location: location
    containerAppName: apiProdAppName
    managedEnvironmentId: managedEnvironment.id
    image: apiProdImage
    keyVaultId: keyVault.id
    keyVaultUri: keyVault.properties.vaultUri
    databaseUrl: databaseUrl
    webBaseUrl: publicWebBaseUrl
    apiPublicBaseUrl: prodApiBaseUrl
    dynamicSessionsPoolManagementEndpoint: dynamicSessionsPoolManagementEndpoint
    authMode: authMode
    entraClientId: entraClientId
    entraAllowedTenantIds: entraAllowedTenantIds
    minReplicas: 1
    maxReplicas: 1
    customDomainNames: []
    logLevel: apiLogLevel
  }
}

module apiStage 'modules/containerapp-api.bicep' = {
  name: 'api-stage'
  params: {
    location: location
    containerAppName: apiStageAppName
    managedEnvironmentId: managedEnvironment.id
    image: apiStageImage
    keyVaultId: keyVault.id
    keyVaultUri: keyVault.properties.vaultUri
    databaseUrl: databaseUrl
    webBaseUrl: stageWebBaseUrl
    apiPublicBaseUrl: stageApiBaseUrl
    dynamicSessionsPoolManagementEndpoint: dynamicSessionsPoolManagementEndpoint
    authMode: authMode
    entraClientId: entraClientId
    entraAllowedTenantIds: entraAllowedTenantIds
    minReplicas: 0
    maxReplicas: 1
    customDomainNames: []
    logLevel: apiLogLevel
  }
}

module webProd 'modules/containerapp-web.bicep' = {
  name: 'web-prod'
  params: {
    location: location
    containerAppName: webProdAppName
    managedEnvironmentId: managedEnvironment.id
    image: webProdImage
    apiBaseUrl: prodApiBaseUrl
    minReplicas: 1
    maxReplicas: 1
    customDomainNames: []
  }
}

module webStage 'modules/containerapp-web.bicep' = {
  name: 'web-stage'
  params: {
    location: location
    containerAppName: webStageAppName
    managedEnvironmentId: managedEnvironment.id
    image: webStageImage
    apiBaseUrl: stageApiBaseUrl
    minReplicas: 0
    maxReplicas: 1
    customDomainNames: []
  }
}

module migrateJob 'modules/containerapp-job-migrate.bicep' = {
  name: 'migrate-job'
  params: {
    location: location
    jobName: migrationJobName
    managedEnvironmentId: managedEnvironment.id
    image: migrationsImage
    databaseUrl: databaseUrl
    migrationLockTimeout: migrationLockTimeout
    migrationStatementTimeout: migrationStatementTimeout
    seedDefaultTenantId: seedDefaultTenantId
    seedDefaultAppClientId: seedDefaultAppClientId
    seedDefaultUserOid: seedDefaultUserOid
    seedDefaultUserEmail: seedDefaultUserEmail
    seedDefaultUserDisplayName: seedDefaultUserDisplayName
  }
}

output apiProdBaseUrl string = prodApiBaseUrl
output webProdBaseUrl string = publicWebBaseUrl
output apiStageBaseUrl string = stageApiBaseUrl
output webStageBaseUrl string = stageWebBaseUrl
output stageWebFqdn string = webStage.outputs.ingressFqdn
