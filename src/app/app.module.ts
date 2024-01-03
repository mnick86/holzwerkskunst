import {NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';
import {BrowserAnimationsModule} from '@angular/platform-browser/animations';
import {ButtonModule} from 'primeng/button';

import {AppRoutingModule} from './app-routing.module';
import {AppComponent} from './app.component';
import {MenubarModule} from 'primeng/menubar';
import {HomeComponent} from './home/home.component';
import {PreviewComponent} from './preview/preview.component';
import {CardModule} from 'primeng/card';
import {ImageModule} from 'primeng/image';
import {HttpClientModule} from '@angular/common/http';
import {TagModule} from 'primeng/tag';
import {ImpressumComponent} from './impressum/impressum.component';
import {HeaderComponent} from './header/header.component';
import {FooterComponent} from './footer/footer.component';
import {SidebarModule} from 'primeng/sidebar';
import {GalleriaModule} from 'primeng/galleria';
import {ProductListComponent} from './product-list/product-list.component';
import {ProductComponent} from './product/product.component';
import {DataProtectionComponent} from './data-protection/data-protection.component';
import {PersonalInfosComponent} from './personal-infos/personal-infos.component';
import {MarkdownModule} from 'ngx-markdown';
import {ProductsForTagComponent} from './products-for-tag/products-for-tag.component';

@NgModule({
  declarations: [
    AppComponent,
    HomeComponent,
    PreviewComponent,
    ImpressumComponent,
    HeaderComponent,
    FooterComponent,
    ProductsForTagComponent,
    ProductListComponent,
    ProductComponent,
    DataProtectionComponent,
    PersonalInfosComponent,
  ],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    AppRoutingModule,
    ButtonModule,
    CardModule,
    MenubarModule,
    ImageModule,
    HttpClientModule,
    TagModule,
    SidebarModule,
    GalleriaModule,
    MarkdownModule.forRoot(),
  ],
  providers: [],
  bootstrap: [AppComponent],
})
export class AppModule {}
