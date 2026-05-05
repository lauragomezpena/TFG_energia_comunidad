from django.shortcuts import render
from rest_framework import status, generics
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from .models import CustomUser
from .serializers import UserSerializer, ChangePasswordSerializer, UpdateEmailSerializer
from django.core.mail import send_mail
from django.conf import settings
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

class UserRegisterView(generics.CreateAPIView):
    queryset = CustomUser.objects.all()
    serializer_class = UserSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            refresh = RefreshToken.for_user(user)
            return Response({
                'user': serializer.data,
                'access': str(refresh.access_token),
                'refresh': str(refresh),
            }, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class UserListView(generics.ListAPIView):
    serializer_class = UserSerializer
    queryset = CustomUser.objects.all()

class UserRetrieveUpdateDestroyView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = UserSerializer
    queryset = CustomUser.objects.all()


class LogoutView(APIView):

    def post(self, request):
        """Realiza el logout eliminando el RefreshToken (revocar)"""
        try:
        # Obtenemos el RefreshToken del request
        #Se esperan que esté en el header Authorization
            refresh_token = request.data.get('refresh', None)
            if not refresh_token:
                return Response({"detail": "No refresh token provided."},
                status=status.HTTP_400_BAD_REQUEST)
                # Revocar el RefreshToken
            token = RefreshToken(refresh_token)
            token.blacklist()
            return Response({"detail": "Logout successful"},
            status=status.HTTP_205_RESET_CONTENT)
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)

class ChangePasswordView(generics.UpdateAPIView):
    serializer_class = ChangePasswordSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        return self.request.user

    def update(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        if serializer.is_valid():
            user = self.get_object()
            if not user.check_password(serializer.data.get("old_password")):
                return Response({"old_password": ["Contraseña antigua incorrecta."]}, status=status.HTTP_400_BAD_REQUEST)
            user.set_password(serializer.data.get("new_password"))
            user.save()
            return Response({"message": "Contraseña actualizada con éxito."}, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class UpdateEmailView(generics.UpdateAPIView):
    serializer_class = UpdateEmailSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        return self.request.user

    def perform_update(self, serializer):
        super().perform_update(serializer)
        user = self.get_object()
        
        # Enviar el correo de confirmación
        subject = '¡Bienvenido a E-Community! ⚡'
        message = f'Hola {user.username},\n\nTu email ({user.email}) ha sido registrado correctamente.'
        html_message = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 30px; border: 1px solid #e0e0e0; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.05);">
            <div style="text-align: center; margin-bottom: 20px;">
                <h2 style="color: #1e88e5; font-size: 28px; margin: 0;">E-Community</h2>
                <p style="color: #888; margin-top: 5px;">Plataforma de Gestión Energética</p>
            </div>
            <p style="font-size: 16px; color: #333; line-height: 1.6;">Hola <b>{user.username}</b>,</p>
            <p style="font-size: 16px; color: #333; line-height: 1.6;">Tu dirección de correo electrónico (<strong>{user.email}</strong>) ha sido vinculada con éxito a tu panel de control de vivienda.</p>
            <div style="background-color: #f4f9fd; padding: 20px; border-left: 5px solid #1e88e5; border-radius: 0 8px 8px 0; margin: 25px 0;">
                <p style="margin: 0; font-size: 15px; color: #444; line-height: 1.5;">
                    A partir de este momento, nuestro motor analítico podrá enviarte alertas de desviaciones de consumo, avisos predictivos y tu recomendación mensual de tarifas directamente a esta bandeja de entrada.
                </p>
            </div>
            <p style="font-size: 16px; color: #333; line-height: 1.6;">¡Empieza a descubrir todo lo que puedes ahorrar!</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
            <p style="font-size: 13px; color: #aaa; text-align: center; margin: 0;">
                © 2026 E-Community.<br>Este es un mensaje automático de tu sistema TFG.
            </p>
        </div>
        """
        
        try:
            send_mail(
                subject,
                message,
                settings.EMAIL_HOST_USER,
                [user.email],
                fail_silently=False,
                html_message=html_message
            )
        except Exception as e:
            print(f"Error enviando correo a {user.email}: {e}")