import BigQueryGateway, { QueryResult } from "./BigQueryGateway";

class BigQueryService {
  private static instance: BigQueryService | null = null;
  private bigQueryGateway: BigQueryGateway;

  public static getInstance(): BigQueryService {
    if (!BigQueryService.instance) {
      BigQueryService.instance = new BigQueryService();
    }
    return BigQueryService.instance;
  }

  constructor(bigQueryGateway?: BigQueryGateway) {
    this.bigQueryGateway = bigQueryGateway || new BigQueryGateway();
  }

  public async executeQuery(query: string): Promise<QueryResult> {
    return this.bigQueryGateway.executeQuery(query);
  }
}

export default BigQueryService;
