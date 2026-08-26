export enum ServiceJwtScope {
  RagRetrieve = 'rag:retrieve',
  RagGenerate = 'rag:generate',
  JobsIndex = 'jobs:index',
}

export interface ServiceJwtClaims {
  sub: string;
  iss: string;
  aud: string;
  scope: ServiceJwtScope;
  iat: number;
  exp: number;
  jti: string;
  kid: string;
}

export interface IssuedServiceToken {
  token: string;
  claims: ServiceJwtClaims;
}
