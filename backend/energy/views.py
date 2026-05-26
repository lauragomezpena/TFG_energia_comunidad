from rest_framework import generics
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404
from .models import Reading, Home, Alert
from .serializers import ReadingSerializer, HomeSerializer, AlertSerializer
from .services.tariff_recommendation import generate_recommendation
from .services.prediction_service import generate_forecast

class HomeListView(generics.ListAPIView):
    serializer_class = HomeSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        # Admin can see all, owners can see only theirs + Zonas Comunes
        user = self.request.user
        if user.role == 'admin':
            return Home.objects.all()
        from django.db.models import Q
        return Home.objects.filter(Q(owner=user) | Q(name="Zonas Comunes"))

class ReadingListView(generics.ListAPIView):
    serializer_class = ReadingSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    # We will remove pagination for now so recharts can get the full dataset easily,
    # or handle it in the frontend. If data is 89k rows, we should send just what is needed!
    # Let's keep default pagination but we might need a large page size for a time-series chart.
    # We will let frontend figure it out, or we provide an unpaginated endpoint for the chart.

    def get_queryset(self):
        user = self.request.user
        # Filtering by user's homes + Zonas Comunes
        from django.db.models import Q
        if user.role == 'admin':
            queryset = Reading.objects.all()
        else:
            queryset = Reading.objects.filter(Q(home__owner=user) | Q(home__name="Zonas Comunes"))
        
        # Opcional: Filtrar por casa si viene en query params ("?home_id=X")
        home_id = self.request.query_params.get('home_id')
        if home_id:
            queryset = queryset.filter(home_id=home_id)
            
        return queryset.order_by('timestamp')

class TariffRecommendationView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        user = request.user
        home_id = request.query_params.get('home_id')
        
        if not home_id:
            if user.role != 'admin':
                home = Home.objects.filter(owner=user).first()
                if home:
                    home_id = home.id
            else:
                return Response({"error": "Debe proporcionar home_id"}, status=400)
                
        home = get_object_or_404(Home, id=home_id)
        if user.role != 'admin' and home.owner != user:
            return Response({"error": "Permiso denegado"}, status=403)
            
        result = generate_recommendation(home.id)
        if "error" in result:
            return Response({"error": result["error"]}, status=400)
            
        return Response(result)


class PredictionView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        user = request.user
        home_id = request.query_params.get('home_id')

        if not home_id:
            if user.role != 'admin':
                home = Home.objects.filter(owner=user).first()
                if home:
                    home_id = home.id
            else:
                return Response({"error": "Debe proporcionar home_id"}, status=400)

        home = get_object_or_404(Home, id=home_id)
        if user.role != 'admin' and home.owner != user:
            return Response({"error": "Permiso denegado"}, status=403)

        result = generate_forecast(home.id)
        if "error" in result:
            return Response({"error": result["error"]}, status=400)

        return Response(result)


class AlertListView(generics.ListAPIView):
    serializer_class = AlertSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        user = self.request.user
        queryset = Alert.objects.filter(home__owner=user)
        
        home_id = self.request.query_params.get('home_id')
        if home_id:
            queryset = queryset.filter(home_id=home_id)
            
        status = self.request.query_params.get('status')
        if status:
            queryset = queryset.filter(status=status.upper())
            
        is_read = self.request.query_params.get('is_read')
        if is_read is not None:
            is_read_bool = is_read.lower() == 'true'
            queryset = queryset.filter(is_read=is_read_bool)
            
        return queryset


class AlertDetailView(generics.RetrieveUpdateAPIView):
    serializer_class = AlertSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Alert.objects.filter(home__owner=self.request.user)
