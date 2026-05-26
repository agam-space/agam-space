import { Injectable, Logger } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

@Injectable()
export class PasswordService {
  private readonly logger = new Logger(PasswordService.name);

  private readonly argon2Options = {
    memoryCost: 32_768, // 32 MB (sensitive profile)
    timeCost: 3, // 3 iterations
    parallelism: 2, // 2 threads
  };

  async hashPassword(password: string): Promise<string> {
    if (!password || password.length === 0) {
      throw new Error('Password cannot be empty');
    }

    try {
      return hash(password, {
        ...this.argon2Options,
        outputLen: 32,
      });
    } catch (error) {
      throw new Error(
        `Password hashing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { cause: error }
      );
    }
  }

  async verifyPassword(password: string, encodedHash: string): Promise<boolean> {
    if (!password || !encodedHash) {
      return false;
    }

    try {
      return verify(encodedHash, password);
    } catch (error) {
      this.logger.error(
        'Password verification failed',
        error instanceof Error ? error.stack : error
      );
      return false;
    }
  }
}
