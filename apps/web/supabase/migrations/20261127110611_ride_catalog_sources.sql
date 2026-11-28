-- O17 stage 6 · catalog sources. The airport and individual van rows cited a JFK shuttle page,
-- the source of the shuttle seat. They now cite the Brazilian references the O17 inventory lists
-- for those journeys: pickup at Congonhas for the airport, vehicle categories for the van.
-- Data only; consulted date unchanged (27/11/2026).
update private.ride_market_modalities set source_url='https://www.uber.com/global/pt-br/r/airports/cgh/pickup/'
 where modality='airport' and source_url='https://www.uber.com/global/en/r/airports/jfk/shuttle/';
update private.ride_market_modalities set source_url='https://www.uber.com/br/pt-br/newsroom/fatos-e-dados-sobre-uber/'
 where modality='van' and source_url='https://www.uber.com/global/en/r/airports/jfk/shuttle/';
