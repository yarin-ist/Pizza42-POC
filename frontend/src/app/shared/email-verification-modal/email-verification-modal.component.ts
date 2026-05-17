import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-email-verification-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './email-verification-modal.component.html',
})
export class EmailVerificationModalComponent {
  /** Email address to display in the modal body */
  @Input() email: string = '';

  /** Emitted when the user dismisses the modal */
  @Output() dismissed = new EventEmitter<void>();

  dismiss(): void {
    this.dismissed.emit();
  }
}
