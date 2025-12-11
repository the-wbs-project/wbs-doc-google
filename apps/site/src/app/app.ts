import { Component, signal, AfterViewInit, ViewChild, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastComponent, ToastModule } from '@syncfusion/ej2-angular-notifications';
import { MessageService } from './services/message.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastModule],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements AfterViewInit {
  protected readonly title = signal('wbs-frontend');

  @ViewChild('toast') toast!: ToastComponent;

  private messageService = inject(MessageService);

  ngAfterViewInit() {
    this.messageService.registerToast(this.toast);
  }
}
