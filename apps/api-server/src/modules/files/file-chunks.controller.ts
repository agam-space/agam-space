import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Put,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FastifyReply, FastifyRequest } from 'fastify';
import { Throttle } from '@nestjs/throttler';

import { FileChunkService } from './file-chunk.service';

import { AuthRequired, CurrentUser } from '../auth/auth.decorator';
import { FilesService } from './files.service';
import { AuthenticatedUser } from '@/modules/auth/dto/auth.dto';
import { cleanupRequestStream } from '@/common/helpers/stream.utils';
import { sendChunkStream } from '@/common/helpers/response.utils';
import { ZodValidationPipe } from 'nestjs-zod';
import { ChunkIndexSchema } from '@agam-space/shared-types';

@ApiTags('File Chunks')
@Controller('files/:fileId/chunks')
@AuthRequired()
@ApiBearerAuth()
export class FileChunksController {
  constructor(
    private readonly fileChunksService: FileChunkService,
    private readonly filesService: FilesService
  ) {}

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Put(':chunkIndex')
  @HttpCode(HttpStatus.CREATED)
  async uploadChunk(
    @Param('fileId') fileId: string,
    @Param('chunkIndex', new ZodValidationPipe(ChunkIndexSchema)) chunkIndex: number,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: FastifyRequest
  ) {
    const checksum = req.headers['x-checksum'] as string | undefined;

    const fileDirPath = await this.filesService.ensureFileDirectory(user.id, fileId);

    await this.fileChunksService.saveFileChunkStream(
      fileDirPath,
      fileId,
      chunkIndex,
      checksum,
      req.raw
    );

    cleanupRequestStream(req.raw);
  }

  @Get('/:chunkIndex')
  @ApiOperation({ summary: 'Download chunk with index' })
  @ApiResponse({ status: 200, description: 'Raw encrypted chunk' })
  async downloadFileChunk(
    @Param('fileId') fileId: string,
    @Param('chunkIndex', new ZodValidationPipe(ChunkIndexSchema)) chunkIndex: number,
    @CurrentUser() user: AuthenticatedUser,
    @Res() response: FastifyReply
  ): Promise<any> {
    const userId = user.id;
    const file = await this.filesService.getFileEntity(userId, fileId);
    if (!file) {
      throw new BadRequestException('File not found');
    }
    if (['pending', 'deleted', 'trashed'].includes(file.status)) {
      throw new NotFoundException('File is not available for download');
    }

    const { stream, chunk } = await this.fileChunksService.readChunkStream(
      userId,
      fileId,
      chunkIndex
    );

    return sendChunkStream(response, stream, chunk);
  }

  @Get('/:chunkIndex/exists')
  @ApiOperation({ summary: 'Check if chunk exists' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async checkChunkExists(
    @Param('fileId') fileId: string,
    @Param('chunkIndex', new ZodValidationPipe(ChunkIndexSchema)) chunkIndex: number,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<void> {
    const userId = user.id;
    const file = await this.filesService.getFileEntity(userId, fileId);
    if (!file) {
      throw new NotFoundException('File not found');
    }

    const exists = await this.fileChunksService.chunkExists(fileId, chunkIndex);
    if (!exists) {
      throw new NotFoundException('Chunk not found');
    }
  }
}
