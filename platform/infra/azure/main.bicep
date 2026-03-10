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
param dnsZoneName string

module foundation 'foundation.bicep' = {
  name: 'foundation'
  params: {
    location: location
    vnetName: vnetName
    acaSubnetName: acaSubnetName
    postgresSubnetName: postgresSubnetName
    vnetAddressPrefix: vnetAddressPrefix
    acaSubnetPrefix: acaSubnetPrefix
    postgresSubnetPrefix: postgresSubnetPrefix
    privateDnsZoneName: privateDnsZoneName
    environmentName: environmentName
    logAnalyticsWorkspaceName: logAnalyticsWorkspaceName
    keyVaultName: keyVaultName
    postgresServerName: postgresServerName
    postgresDatabaseName: postgresDatabaseName
    postgresAdminUsername: postgresAdminUsername
    postgresAdminPassword: postgresAdminPassword
    postgresSkuName: postgresSkuName
    postgresSkuTier: postgresSkuTier
    postgresVersion: postgresVersion
    postgresStorageMb: postgresStorageMb
    dnsZoneName: dnsZoneName
  }
}

output managedEnvironmentId string = foundation.outputs.managedEnvironmentId
output managedEnvironmentDefaultDomain string = foundation.outputs.managedEnvironmentDefaultDomain
output managedEnvironmentStaticIp string = foundation.outputs.managedEnvironmentStaticIp
output keyVaultId string = foundation.outputs.keyVaultId
output keyVaultNameOutput string = foundation.outputs.keyVaultNameOutput
output keyVaultUri string = foundation.outputs.keyVaultUri
output postgresFqdn string = foundation.outputs.postgresFqdn
output postgresDatabaseNameOutput string = foundation.outputs.postgresDatabaseNameOutput
output dnsZoneId string = foundation.outputs.dnsZoneId
output dnsZoneNameOutput string = foundation.outputs.dnsZoneNameOutput
