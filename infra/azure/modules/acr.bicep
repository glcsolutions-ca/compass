param location string
param registryName string
param skuName string = 'Standard'

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: registryName
  location: location
  sku: {
    name: skuName
  }
  properties: {
    adminUserEnabled: false
  }
}

output registryId string = registry.id
output registryNameOutput string = registry.name
output loginServer string = registry.properties.loginServer
