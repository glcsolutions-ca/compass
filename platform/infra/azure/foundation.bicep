param location string
param vnetName string
param acaSubnetName string
param postgresSubnetName string
param vnetAddressPrefix string = '10.42.0.0/16'
param acaSubnetPrefix string = '10.42.0.0/23'
param postgresSubnetPrefix string = '10.42.2.0/24'
param privateDnsZoneName string
param environmentName string
param logAnalyticsWorkspaceName string
param keyVaultName string
param postgresServerName string
param postgresDatabaseName string = 'compass'
param postgresAdminUsername string
@secure()
param postgresAdminPassword string
param postgresSkuName string = 'Standard_B1ms'
param postgresSkuTier string = 'Burstable'
param postgresVersion string = '16'
param postgresStorageMb int = 32768
param dnsZoneName string = 'compass.glcsolutions.ca'

module network 'modules/network.bicep' = {
  name: 'network'
  params: {
    location: location
    vnetName: vnetName
    acaSubnetName: acaSubnetName
    postgresSubnetName: postgresSubnetName
    vnetAddressPrefix: vnetAddressPrefix
    acaSubnetPrefix: acaSubnetPrefix
    postgresSubnetPrefix: postgresSubnetPrefix
    privateDnsZoneName: privateDnsZoneName
  }
}

module containerAppsEnvironment 'modules/containerapps-env.bicep' = {
  name: 'containerapps-env'
  params: {
    location: location
    environmentName: environmentName
    infrastructureSubnetId: network.outputs.acaInfrastructureSubnetId
    logAnalyticsWorkspaceName: logAnalyticsWorkspaceName
  }
}

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  properties: {
    tenantId: tenant().tenantId
    enableRbacAuthorization: true
    enablePurgeProtection: true
    enableSoftDelete: true
    sku: {
      family: 'A'
      name: 'standard'
    }
    publicNetworkAccess: 'Enabled'
  }
}

resource postgresAdminPasswordSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'postgres-admin-password'
  properties: {
    value: postgresAdminPassword
  }
}

module postgres 'modules/postgres-flex.bicep' = {
  name: 'postgres'
  params: {
    location: location
    serverName: postgresServerName
    databaseName: postgresDatabaseName
    delegatedSubnetId: network.outputs.postgresSubnetId
    privateDnsZoneId: network.outputs.privateDnsZoneId
    adminLogin: postgresAdminUsername
    adminPassword: postgresAdminPassword
    skuName: postgresSkuName
    skuTier: postgresSkuTier
    postgresVersion: postgresVersion
    storageSizeMb: postgresStorageMb
  }
}

resource dnsZone 'Microsoft.Network/dnsZones@2018-05-01' = {
  name: dnsZoneName
  location: 'global'
}

output managedEnvironmentId string = containerAppsEnvironment.outputs.environmentId
output managedEnvironmentDefaultDomain string = containerAppsEnvironment.outputs.defaultDomain
output managedEnvironmentStaticIp string = containerAppsEnvironment.outputs.staticIp
output keyVaultId string = keyVault.id
output keyVaultNameOutput string = keyVault.name
output keyVaultUri string = keyVault.properties.vaultUri
output postgresFqdn string = postgres.outputs.fqdn
output postgresDatabaseNameOutput string = postgresDatabaseName
output dnsZoneId string = dnsZone.id
output dnsZoneNameOutput string = dnsZone.name
