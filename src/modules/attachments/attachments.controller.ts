import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiBody, ApiConsumes, ApiOkResponse, ApiOperation } from '@nestjs/swagger'

import { AttachmentKind, AttachmentRefType, MAX_ATTACHMENT_BYTES } from '@/commons/constants/commitment.constant'
import { ApiRest } from '@/commons/decorators/api-rest.decorator'
import { ResponseMessage } from '@/commons/decorators/response-message.decorator'
import { EmptyResponseDto } from '@/commons/helpers/api-response.helper'

import { AttachmentsService, UploadedAttachment } from './attachments.service'
import { AttachmentListQueryDto, UploadAttachmentDto } from './dto/request/attachments.dto'
import { AttachmentListResponseDto, AttachmentResponseDto } from './dto/response/attachments-response.dto'

// Archivos de préstamos, inversiones y gastos (P27, D100)
@ApiRest('attachments')
@Controller('attachments')
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Get()
  @ApiOperation({ summary: 'Files of one record, oldest first, each with a signed link' })
  @ApiOkResponse({ type: AttachmentListResponseDto })
  @ResponseMessage('ATTACHMENTS_LISTED', 'Attachments listed')
  list(@Query() query: AttachmentListQueryDto) {
    return this.attachmentsService.list(query.refType, query.refId)
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_ATTACHMENT_BYTES } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'refType', 'refId'],
      properties: {
        file: { type: 'string', format: 'binary', description: 'Image, PDF, Word, Excel or text (≤ 15 MB)' },
        refType: { type: 'string', enum: Object.values(AttachmentRefType) },
        refId: { type: 'string' },
        kind: { type: 'string', enum: Object.values(AttachmentKind) },
        name: { type: 'string' },
      },
    },
  })
  @ApiOperation({ summary: 'Attach a file to a loan, an investment, an installment, a contribution or an expense' })
  @ApiOkResponse({ type: AttachmentResponseDto })
  @ResponseMessage('ATTACHMENT_CREATED', 'File attached')
  upload(@Body() body: UploadAttachmentDto, @UploadedFile() file?: UploadedAttachment) {
    if (!file?.buffer) throw new BadRequestException('file is required')
    return this.attachmentsService.upload(body, file)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a file; it leaves the bucket if nothing else uses it' })
  @ApiOkResponse({ type: EmptyResponseDto })
  @ResponseMessage('ATTACHMENT_DELETED', 'Attachment deleted')
  delete(@Param('id') id: string) {
    return this.attachmentsService.delete(id)
  }
}
