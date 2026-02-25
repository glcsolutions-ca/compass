param location string
param namespaceName string
param queueName string
param skuName string = 'Basic'
param disableLocalAuth bool = true
param publicNetworkAccess string = 'Enabled'
param minimumTlsVersion string = '1.2'

resource namespace 'Microsoft.ServiceBus/namespaces@2024-01-01' = {
  name: namespaceName
  location: location
  sku: {
    name: skuName
    tier: skuName
  }
  properties: {
    disableLocalAuth: disableLocalAuth
    minimumTlsVersion: minimumTlsVersion
    publicNetworkAccess: publicNetworkAccess
  }
}

resource queue 'Microsoft.ServiceBus/namespaces/queues@2024-01-01' = {
  name: '${namespace.name}/${queueName}'
  properties: {
    deadLetteringOnMessageExpiration: true
    defaultMessageTimeToLive: 'P14D'
    lockDuration: 'PT1M'
    maxDeliveryCount: 10
  }
}

output namespaceId string = namespace.id
output namespaceNameOutput string = namespace.name
output namespaceFqdn string = '${namespace.name}.servicebus.windows.net'
output queueId string = queue.id
output queueNameOutput string = queue.name
