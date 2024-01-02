import { Component } from '@angular/core';
import { MenuItem } from 'primeng/api';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'holzwerkskunst';

  items: MenuItem[] = [
    {
      label: 'HOME',
      routerLink: 'home'
    },
    {
      label: 'Impressum',
      routerLink: 'impressum'
    }
  ]
}
