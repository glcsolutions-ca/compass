param location string
param serverName string
param databaseName string = 'compass'
param delegatedSubnetId string
param privateDnsZoneId string
param adminLogin string
@secure()
param adminPassword string
param skuName string = 'Standard_B1ms'
param skuTier string = 'Burstable'
param postgresVersion string = '16'
param storageSizeMb int = 32768

resource postgresServer 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: serverName
  location: location
  sku: {
    name: skuName
    tier: skuTier
  }
  properties: {
    version: postgresVersion
    administratorLogin: adminLogin
    administratorLoginPassword: adminPassword
    storage: {
      storageSizeGB: int(storageSizeMb / 1024)
    }
    network: {
      delegatedSubnetResourceId: delegatedSubnetId
      privateDnsZoneArmResourceId: privateDnsZoneId
      publicNetworkAccess: 'Disabled'
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
  }
}

resource postgresDatabase 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: postgresServer
  name: databaseName
}

output serverId string = postgresServer.id
output serverNameOutput string = postgresServer.name
output databaseNameOutput string = postgresDatabase.name
output fqdn string = postgresServer.properties.fullyQualifiedDomainName
