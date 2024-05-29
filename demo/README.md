## Demo

You can run a demo in the `demo`  directory. You will need multiple terminals to run each process separately.

### Setup:
- Git clone this repo
- Run `npm i`

### Zeebe-broker
Start a Zeebe broker:

```
docker run -it --name zeebe -p 26500:26500 camunda/zeebe:1.3.9
```

In case you want to use the Zeebe Simple Monitor to track your activities, you will need to open multiple powershell terminals and paste the code snippets there

### Hazelcast client
```
docker run --name hazelcast -d -p 5701:5701 hazelcast/hazelcast:5.0.3
```
### Zeebe client
```
docker run --name zeebe -d -p 26500:26500 -p 26501:26501 -p 26502:26502 -p 9600:9600 `
  -e ZEEBE_LOG_LEVEL=info `
  -e ZEEBE_HAZELCAST_REMOTE_ADDRESS=172.17.0.2:5701 `
  -e ZEEBE_BROKER_EXPORTERS_HAZELCAST_CLASSNAME=io.zeebe.hazelcast.exporter.HazelcastExporter `
  -e ZEEBE_BROKER_EXPORTERS_HAZELCAST_JARPATH=exporters/zeebe-hazelcast-exporter.jar `
  -v /path/to/your-code/application/zeebe-hazelcast-exporter-1.0.1-jar-with-dependencies.jar:/usr/local/zeebe/exporters/zeebe-hazelcast-exporter.jar `
  -v /path/to/your-code/application/zeebe.cfg.toml:/usr/local/zeebe/config/application.yaml `
  camunda/zeebe:latest
```
### Zeebe Simple monitor
```
docker run --name monitor -d -p 8082:8082 `
  -e zeebe.client.broker.gateway-address=172.17.0.3:26500 `
  -e ZEEBE_HAZELCAST_CLUSTER_NAME=dev `
  -e zeebe.client.worker.hazelcast.connection=172.17.0.2:5701 `
  ghcr.io/camunda-community-hub/zeebe-simple-monitor:latest
```

### Affinity-Server
Start the Affinity Server:

```
cd demo
node affinity-server.js
```

### Affinity worker
Start the Affinity Worker:

```
cd demo
node affinity-worker.js
```

### Zeebe-worker(s)
```
cd demo
node zeebe-workers.js
```

### Initiate test worker
Start the demo workers / REST Server / REST Client:

```
cd demo
node index.js
```

## Using in your code

You can install this from npm:

```
npm i zeebe-node-affinity
```

And use it in place / alongside the standard Node client. You will need to host the Affinity Server on your network for it to be of any use. Docker image coming soon.
