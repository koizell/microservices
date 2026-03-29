"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const supertest_1 = require("supertest");
const app_module_1 = require("./../src/app.module");
describe('NotificationController (e2e)', () => {
    let app;
    beforeEach(async () => {
        const moduleFixture = await testing_1.Test.createTestingModule({
            imports: [app_module_1.AppModule],
        }).compile();
        app = moduleFixture.createNestApplication();
        await app.init();
    });
    it('/notifications (GET)', () => {
        return (0, supertest_1.default)(app.getHttpServer())
            .get('/notifications')
            .expect(200)
            .expect('Lista de notificaciones');
    });
});
//# sourceMappingURL=app.e2e-spec.js.map