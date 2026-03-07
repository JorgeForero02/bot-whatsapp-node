import { Global, Module } from '@nestjs/common';
import { CredentialService } from './credential.service';

@Global()
@Module({
  providers: [CredentialService],
  exports: [CredentialService],
})
export class CredentialsModule {}
