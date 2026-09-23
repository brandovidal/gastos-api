import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common'
import { ApiOperation } from '@nestjs/swagger'

import { ApiRest } from '@/commons/decorators/api-rest.decorator'
import { ResponseMessage } from '@/commons/decorators/response-message.decorator'

import { DraftFieldsDto, DraftListQueryDto } from './dto/request/drafts.dto'
import { DraftsService } from './drafts.service'

@ApiRest('drafts')
@Controller('drafts')
export class DraftsController {
  constructor(private readonly draftsService: DraftsService) {}

  @Get()
  @ApiOperation({ summary: 'Borrador: expenses pending review (tab=review), failed or discarded, from every channel' })
  @ResponseMessage('DRAFTS_LISTED', 'Drafts listed')
  list(@Query() query: DraftListQueryDto) {
    return this.draftsService.list(query)
  }

  @Get(':id')
  @ApiOperation({ summary: 'One draft, with a short-lived link to its screenshot when it has one' })
  @ResponseMessage('DRAFT_FOUND', 'Draft found')
  get(@Param('id') id: string) {
    return this.draftsService.get(id)
  }

  @Post()
  @ApiOperation({ summary: 'Nuevo gasto: create a draft from the web form (then POST /drafts/:id/save)' })
  @ResponseMessage('DRAFT_CREATED', 'Draft created')
  create(@Body() body: DraftFieldsDto) {
    return this.draftsService.create(body)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit the fields of a draft; missing fields are recomputed' })
  @ResponseMessage('DRAFT_UPDATED', 'Draft updated')
  update(@Param('id') id: string, @Body() body: DraftFieldsDto) {
    return this.draftsService.update(id, body)
  }

  @Post(':id/save')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Save into its destination table (422 EXPENSE_NOT_SAVEABLE while fields are missing)' })
  @ResponseMessage('DRAFT_SAVED', 'Draft saved')
  save(@Param('id') id: string) {
    return this.draftsService.save(id)
  }

  @Post(':id/discard')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('DRAFT_DISCARDED', 'Draft discarded')
  discard(@Param('id') id: string) {
    return this.draftsService.discard(id)
  }

  @Post(':id/retry')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Run the AI again on a failed draft (text, image or voice note)' })
  @ResponseMessage('DRAFT_RETRIED', 'Draft retried')
  retry(@Param('id') id: string) {
    return this.draftsService.retry(id)
  }
}
