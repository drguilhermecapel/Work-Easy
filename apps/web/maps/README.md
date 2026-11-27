# Mapa local de Saúde, São Paulo

O app inclui uma amostra de vias, edifícios e estabelecimentos para ensaiar a busca e a rota por automóvel. Os arquivos cartográficos ficam na mesma origem do app. O painel de ensaio em `/corridas` desenha um trajeto calculado com OSRM entre Italianinho VB e Oggi Sorvetes. Distância e duração usam o perfil de velocidade do grafo. A posição escolhida pelo passageiro precisa ser confirmada no embarque.

## Dados e licença

`saude.osm.bz2` contém o recorte público de 27/11/2026, limitado para exibição a oeste −46.6430, sul −23.6230, leste −46.6350 e norte −23.6160. O arquivo conserva os nós das vias, sentidos, acessos e relações de conversão. O processo de seleção remove usuários e identificadores de edição. O extrato e os tiles derivados são disponibilizados sob ODbL 1.0 com atribuição a © OpenStreetMap contributors. A versão redistribuída do extrato acompanha o código. [Fonte do recorte](https://api.openstreetmap.org/api/0.6/map?bbox=-46.6430,-23.6230,-46.6350,-23.6160) · [Atribuição](https://www.openstreetmap.org/copyright) · [Licença ODbL](https://opendatacommons.org/licenses/odbl/1-0/)

Para atualizar o exemplo, baixar o XML da área, executar `python3 extract.py snapshot CAMINHO.osm` e `python3 extract.py tiles` neste diretório. A segunda etapa usa GDAL com o driver vetorial PMTiles. Verificar os nomes, o sentido das vias e os dois pontos de ensaio antes de atualizar a revisão. Para uma região maior, usar um extrato regional autorizado e processá-lo fora do app. [Extratos do Sudeste](https://download.geofabrik.de/south-america/brazil/sudeste.html)

## Roteamento e busca

1. Em `apps/web/maps`, executar `docker compose up -d`. O primeiro serviço prepara o grafo MLD com o perfil de automóvel do OSRM 6. O segundo atende requisições na porta local 5017. Um teste reproduzível é `curl --fail 'http://127.0.0.1:5017/route/v1/driving/-46.6367045,-23.6206567;-46.6355272,-23.6179524?overview=full&geometries=geojson'`. O grafo distribuído devolve cerca de 401 m e 79 s.
2. Para uma Edge Function na rede Docker do Supabase local, conectar o contêiner do roteador com `docker network connect --alias workeasy-router supabase_network_workeasy "$(docker compose ps -q router)"`. Configurar `OSRM_URL=http://workeasy-router:5000` exclusivamente no backend. O navegador recebe o traçado autorizado para o participante.
3. Depois da migração que cria `private.ride_places_osm` e `private.ride_route_areas`, importar somente no projeto local de simulação com `python3 extract.py import-sql | docker exec -i supabase_db_workeasy psql -U postgres -d postgres -X -v ON_ERROR_STOP=1`. A transação atualiza o índice de lugares e o polígono de demonstração. As autorizações comerciais, os turnos e o orçamento têm registros independentes. O importador recusa um projeto marcado como real.
4. Para outro arquivo PMTiles servido pela mesma origem, configurar `VITE_RIDE_PMTILES_PATH` no build. O arquivo deve expor a camada vetorial `context` e os tipos de feição presentes em `extract.py`. Conferir cobertura, direitos de uso e disponibilidade do servidor no corredor antes de abrir.

## Ensaio da jornada do passageiro

Com o extrato importado no banco local de testes, as migrações aplicadas, os auxiliares de pgTAP carregados e o OSRM em execução, rode em `apps/web`:

```sh
WORKEASY_OSRM_URL=http://127.0.0.1:5017 WORKEASY_ROUTING_DB_PORT=5432 \
  npm test -- test/functions/ride-route-local-smoke.test.ts
```

A porta é a do PostgreSQL **dentro** do contêiner local `supabase_db_workeasy`. O teste exige o ambiente `simulation`, encontra os dois estabelecimentos pelo índice importado, envia os pontos confirmados ao handler de medição e verifica os 401 m de percurso. Em seguida, compara a classe de um veículo de ensaio, aceita a cotação e verifica a criação de um trecho em procura de motorista. A transação reverte todos os dados de passageiros, turnos e solicitações ao encerrar.
