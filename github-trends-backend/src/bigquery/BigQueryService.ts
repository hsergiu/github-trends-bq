import BigQueryGateway, { QueryResult } from "./BigQueryGateway";

class BigQueryService {
  private bigQueryGateway: BigQueryGateway;

  constructor(bigQueryGateway?: BigQueryGateway) {
    this.bigQueryGateway = bigQueryGateway || new BigQueryGateway();
  }

  public async executeQuery(query: string): Promise<QueryResult> {
    return this.bigQueryGateway.executeQuery(query);
  }
}

export default BigQueryService;
