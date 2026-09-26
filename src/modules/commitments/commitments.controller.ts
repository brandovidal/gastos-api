import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common'
import { ApiOkResponse, ApiOperation } from '@nestjs/swagger'

import { ApiRest } from '@/commons/decorators/api-rest.decorator'
import { ResponseMessage } from '@/commons/decorators/response-message.decorator'
import { EmptyResponseDto } from '@/commons/helpers/api-response.helper'

import { CommitmentsService } from './commitments.service'
import {
  CommitmentListQueryDto,
  ContributionDto,
  CreateCommitmentDto,
  UpdateCommitmentDto,
  UpdateContributionDto,
} from './dto/request/commitments.dto'
import {
  CommitmentDetailResponseDto,
  CommitmentListResponseDto,
  ContributionResponseDto,
  GeneratedInstallmentsResponseDto,
} from './dto/response/commitments-response.dto'

// Préstamos e inversiones (P27, D99)
@ApiRest('commitments')
@Controller('commitments')
export class CommitmentsController {
  constructor(private readonly commitmentsService: CommitmentsService) {}

  @Get()
  @ApiOperation({ summary: 'Loans and investments with their progress (paid installments, current one, late)' })
  @ApiOkResponse({ type: CommitmentListResponseDto })
  @ResponseMessage('COMMITMENTS_LISTED', 'Commitments listed')
  list(@Query() query: CommitmentListQueryDto) {
    return this.commitmentsService.list(query)
  }

  @Get(':id')
  @ApiOperation({ summary: 'One loan or investment with its installments and contributions' })
  @ApiOkResponse({ type: CommitmentDetailResponseDto })
  @ResponseMessage('COMMITMENT_FOUND', 'Commitment found')
  get(@Param('id') id: string) {
    return this.commitmentsService.get(id)
  }

  @Post()
  @ApiOperation({
    summary: 'Create it; with a complete plan and a category every installment is created as a fixed cost',
  })
  @ApiOkResponse({ type: CommitmentDetailResponseDto })
  @ResponseMessage('COMMITMENT_CREATED', 'Commitment created')
  create(@Body() body: CreateCommitmentDto) {
    return this.commitmentsService.create(body)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit it (cancellation amount, status…); installments that exist are not touched' })
  @ApiOkResponse({ type: CommitmentDetailResponseDto })
  @ResponseMessage('COMMITMENT_UPDATED', 'Commitment updated')
  update(@Param('id') id: string, @Body() body: UpdateCommitmentDto) {
    return this.commitmentsService.update(id, body)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete it and its contributions; its installments stay as fixed costs' })
  @ApiOkResponse({ type: EmptyResponseDto })
  @ResponseMessage('COMMITMENT_DELETED', 'Commitment deleted')
  delete(@Param('id') id: string) {
    return this.commitmentsService.delete(id)
  }

  @Post(':id/installments')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create the installments of the plan that do not exist yet as fixed costs' })
  @ApiOkResponse({ type: GeneratedInstallmentsResponseDto })
  @ResponseMessage('COMMITMENT_INSTALLMENTS_CREATED', 'Installments created')
  createInstallments(@Param('id') id: string) {
    return this.commitmentsService.createMissingInstallments(id)
  }

  @Post(':id/contributions')
  @ApiOperation({ summary: 'Register what you put into an investment (stocks, bitcoin…)' })
  @ApiOkResponse({ type: ContributionResponseDto })
  @ResponseMessage('CONTRIBUTION_CREATED', 'Contribution registered')
  addContribution(@Param('id') id: string, @Body() body: ContributionDto) {
    return this.commitmentsService.addContribution(id, body)
  }

  @Patch(':id/contributions/:contributionId')
  @ApiOperation({ summary: 'Edit a contribution' })
  @ApiOkResponse({ type: ContributionResponseDto })
  @ResponseMessage('CONTRIBUTION_UPDATED', 'Contribution updated')
  updateContribution(
    @Param('id') id: string,
    @Param('contributionId') contributionId: string,
    @Body() body: UpdateContributionDto,
  ) {
    return this.commitmentsService.updateContribution(id, contributionId, body)
  }

  @Delete(':id/contributions/:contributionId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a contribution and its files' })
  @ApiOkResponse({ type: EmptyResponseDto })
  @ResponseMessage('CONTRIBUTION_DELETED', 'Contribution deleted')
  deleteContribution(@Param('id') id: string, @Param('contributionId') contributionId: string) {
    return this.commitmentsService.deleteContribution(id, contributionId)
  }
}
