import { Component, Input } from '@angular/core';
import { Product } from '../+store/product';

@Component({
  selector: 'app-preview',
  templateUrl: './preview.component.html',
  styleUrl: './preview.component.scss'
})
export class PreviewComponent {
  @Input()
  product!: Product
}
