import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post('midtrans')
  @HttpCode(200)
  handleMidtrans(@Body() body: Record<string, unknown>) {
    return this.webhooksService.handleMidtrans(body);
  }
}
